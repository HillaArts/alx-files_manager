import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import sha1 from 'sha1';
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
}

export default FilesController;
