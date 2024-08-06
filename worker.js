import Bull from 'bull';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import imageThumbnail from 'image-thumbnail';
import dbClient from './utils/db';

// Create a new Bull queue for file processing
const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const fileDocument = await dbClient.db.collection('files').findOne({
    _id: new ObjectId(fileId),
    userId: new ObjectId(userId),
  });

  if (!fileDocument) {
    throw new Error('File not found');
  }

  const sizes = [500, 250, 100];
  for (const size of sizes) {
    const thumbnail = await imageThumbnail(fileDocument.localPath, { width: size });
    const thumbnailPath = `${fileDocument.localPath}_${size}`;
    fs.writeFileSync(thumbnailPath, thumbnail);
  }
});

fileQueue.on('completed', (job) => {
  console.log(`Job completed: ${job.id}`);
});

fileQueue.on('failed', (job, err) => {
  console.log(`Job failed: ${job.id}, error: ${err.message}`);
});