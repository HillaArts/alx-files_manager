import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
    static async postUpload(req, res) {
        const token = req.headers['x-token'];
        const userId = await redisClient.get(`auth_${token}`);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, type, parentId = 0, isPublic = false, data } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Missing name' });
        }

        if (!type || !['folder', 'file', 'image'].includes(type)) {
            return res.status(400).json({ error: 'Missing type' });
        }

        if (type !== 'folder' && !data) {
            return res.status(400).json({ error: 'Missing data' });
        }

        const filesCollection = dbClient.db.collection('files');
        const parentFile = parentId !== 0 ? await filesCollection.findOne({ _id: new ObjectId(parentId) }) : null;

        if (parentId !== 0 && (!parentFile || parentFile.type !== 'folder')) {
            return res.status(400).json({ error: 'Parent not found or not a folder' });
        }

        const newFile = {
            userId: new ObjectId(userId),
            name,
            type,
            isPublic,
            parentId: parentId === 0 ? 0 : new ObjectId(parentId),
        };

        if (type === 'folder') {
            await filesCollection.insertOne(newFile);
            return res.status(201).json(newFile);
        }

        const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const localPath = path.join(folderPath, uuidv4());
        fs.writeFileSync(localPath, Buffer.from(data, 'base64'));

        newFile.localPath = localPath;
        await filesCollection.insertOne(newFile);

        return res.status(201).json(newFile);
    }

    static async getShow(req, res) {
        const token = req.headers['x-token'];
        const userId = await redisClient.get(`auth_${token}`);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fileId = req.params.id;
        const filesCollection = dbClient.db.collection('files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        return res.json(file);
    }

    static async getIndex(req, res) {
        const token = req.headers['x-token'];
        const userId = await redisClient.get(`auth_${token}`);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const parentId = req.query.parentId || 0;
        const page = parseInt(req.query.page, 10) || 0;
        const pageSize = 20;

        const filesCollection = dbClient.db.collection('files');
        const pipeline = [
            { $match: { parentId: parentId === '0' ? 0 : new ObjectId(parentId), userId: new ObjectId(userId) } },
            { $skip: page * pageSize },
            { $limit: pageSize },
        ];

        const files = await filesCollection.aggregate(pipeline).toArray();
        return res.json(files);
    }

    static async putPublish(req, res) {
        const token = req.headers['x-token'];
        const userId = await redisClient.get(`auth_${token}`);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fileId = req.params.id;
        const filesCollection = dbClient.db.collection('files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        await filesCollection.updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: true } });
        const updatedFile = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        return res.status(200).json(updatedFile);
    }

    static async putUnpublish(req, res) {
        const token = req.headers['x-token'];
        const userId = await redisClient.get(`auth_${token}`);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const fileId = req.params.id;
        const filesCollection = dbClient.db.collection('files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        await filesCollection.updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: false } });
        const updatedFile = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        return res.status(200).json(updatedFile);
    }

    static async getFile(req, res) {
        const token = req.headers['x-token'];
        const fileId = req.params.id;

        const filesCollection = dbClient.db.collection('files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

        if (!file) {
            return res.status(404).json({ error: 'Not found' });
        }

        if (!file.isPublic) {
            const userId = await redisClient.get(`auth_${token}`);

            if (!userId || !file.userId.equals(new ObjectId(userId))) {
                return res.status(404).json({ error: 'Not found' });
            }
        }

        if (file.type === 'folder') {
            return res.status(400).json({ error: "A folder doesn't have content" });
        }

        if (!fs.existsSync(file.localPath)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const mimeType = mime.lookup(file.name) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        const fileStream = fs.createReadStream(file.localPath);
        fileStream.pipe(res);
    }
}

export default FilesController;
