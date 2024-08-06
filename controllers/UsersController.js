import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
    static async postNew(req, res) {
        const { email, password } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Missing email' });
        }
        if (!password) {
            return res.status(400).json({ error: 'Missing password' });
        }

        const usersCollection = dbClient.db.collection('users');
        const user = await usersCollection.findOne({ email });

        if (user) {
            return res.status(400).json({ error: 'Already exist' });
        }

        const hashedPassword = sha1(password);
        const newUser = {
            email,
            password: hashedPassword,
        };

        await usersCollection.insertOne(newUser);
        const newUserId = newUser._id;

        return res.status(201).json({ id: newUserId, email });
    }

    static async getMe(req, res) {
        const token = req.headers['x-token'];

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const key = `auth_${token}`;
        const userId = await redisClient.get(key);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const user = await dbClient.db.collection('users').findOne({ _id: dbClient.ObjectId(userId) });

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        return res.status(200).json({ id: user._id, email: user.email });
    }
}

export default UsersController;
