import redisClient from './utils/redis';

(async () => {
    console.log(redisClient.isAlive());  // true
    console.log(await redisClient.get('myKey'));  // null
    await redisClient.set('myKey', '12', 5);
    console.log(await redisClient.get('myKey'));  // 12

    setTimeout(async () => {
        console.log(await redisClient.get('myKey'));  // null
    }, 1000 * 10);
})();