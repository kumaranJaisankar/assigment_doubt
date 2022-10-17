const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3002, () =>
      console.log("Server Running at http://localhost:3002/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const isUser = `
        SELECT *
        FROM user 
        WHERE username = '${username}';`;
    const dbUser = await db.get(isUser);
    if (dbUser === undefined) {
      const createUserQuery = `
                INSERT INTO 
                    user (name, username, password, gender) 
                VALUES 
                    (
                    '${name}', 
                    '${username}',
                    '${hashedPassword}', 
                    '${gender}')`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  }
});

//login user API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(isUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payLoad = {
        username: username,
      };
      const jwtToken = jwt.sign(payLoad, "KUMS_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateMiddle = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.send(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "KUMS_TOKEN", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  }
};

//API 3
app.get("/user/tweets/feed/", authenticateMiddle, async (request, response) => {
  try {
    const { username } = request;
    const getQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;
    const dbUserId = await db.get(getQuery);
    const tweetQuery = `
    SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
    FROM (user INNER JOIN follower ON 
    user.user_id = follower.following_user_id)AS T
    INNER JOIN tweet ON T.following_user_id = tweet.user_id
    WHERE T.follower_user_id = ${dbUserId.user_id}
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
    const tweetFollow = await db.all(tweetQuery);
    response.send(tweetFollow);
  } catch (e) {
    console.log(e.message);
  }
});

//API 4
app.get("/user/following/", authenticateMiddle, async (request, response) => {
  try {
    const { username } = request;
    const getQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;
    const dbUserId = await db.get(getQuery);
    const tweetQuery = `
    SELECT user.name
    FROM user INNER JOIN follower ON 
    user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${dbUserId.user_id};`;
    const tweetFollow = await db.all(tweetQuery);
    response.send(tweetFollow);
  } catch (e) {
    console.log(e.message);
  }
});

//API 5

app.get("/user/followers/", authenticateMiddle, async (request, response) => {
  try {
    const { username } = request;
    const getQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;
    const dbUserId = await db.get(getQuery);
    const tweetQuery = `
    SELECT user.name
    FROM user INNER JOIN follower ON 
    user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${dbUserId.user_id};`;
    const tweetFollow = await db.all(tweetQuery);
    response.send(tweetFollow);
  } catch (e) {
    console.log(e.message);
  }
});

const isValidRequest = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const userQuery = `
    SELECT user_id 
    FROM user
    WHERE username = '${username}';
    `;
  const dbUserId = await db.get(userQuery);
  const { user_id } = dbUserId;

  const tweetUserQuery = `
    SELECT user_id
    FROM tweet
    WHERE tweet_id = ${tweetId};`;
  const tweetUser = await db.get(tweetUserQuery);

  const isFollowingQuery = `
    SELECT *
    FROM follower
    WHERE (follower_user_id = ${user_id}) AND 
    following_user_id = ${tweetUser.user_id};`;
  const combineUser = await db.get(isFollowingQuery);
  if (combineUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateMiddle,
  isValidRequest,
  async (request, response) => {
    const { tweetId } = request.params;
    const tweetQuery = `
    SELECT tweet.tweet,COUNT(like_id) AS likes,COUNT(reply.reply) AS replies,tweet.date_time AS dateTime
    FROM (like INNER JOIN reply ON like.tweet_id = reply.tweet_id) AS T
    INNER JOIN tweet ON T.tweet_id = tweet.tweet_id
    WHERE like.tweet_id = ${tweetId} AND reply.tweet_id=${tweetId}
    GROUP BY reply_id;
  `;
    const tweetDetails = await db.get(tweetQuery);
    response.send(tweetDetails);
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateMiddle,
  isValidRequest,
  async (request, response) => {
    const { tweetId } = request.params;
    const tweetLikeQuery = `
     SELECT user.username
     FROM like INNER JOIN user ON 
     like.user_id = user.user_id
     WHERE like.tweet_id = ${tweetId};`;
    const tweetLikesDetails = await db.all(tweetLikeQuery);
    const userLikedArray = tweetLikesDetails.map((each) => each.username);
    response.send({ likes: userLikedArray });
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateMiddle,
  isValidRequest,
  async (request, response) => {
    const { tweetId } = request.params;
    const tweetReplyQuery = `
    SELECT user.name, reply.reply
    FROM reply INNER JOIN user ON 
    reply.user_id = user.user_id
    WHERE reply.tweet_id = ${tweetId};`;
    const tweetReplyDetails = await db.all(tweetReplyQuery);
    response.send({ replies: tweetReplyDetails });
  }
);

//API 9
app.get("/user/tweets/", authenticateMiddle, async (request, response) => {
  try {
    const { username } = request;
    const getQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;
    const dbUserId = await db.get(getQuery);
    const tweetQuery = `
    SELECT tweet.tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM (tweet INNER JOIN like ON 
    tweet.tweet_id = like.tweet_id) AS T 
    INNER JOIN reply ON T.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${dbUserId.user_id} 
    GROUP BY like.tweet_id;`;
    const tweetFollow = await db.all(tweetQuery);
    response.send(tweetFollow);
  } catch (e) {
    console.log(e.message);
  }
});

//API 10
app.post("/user/tweets/", authenticateMiddle, async (request, response) => {
  try {
    const { username } = request;
    const { tweet } = request.body;
    const getQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;
    const dbUserId = await db.get(getQuery);
    const tweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time)
    VALUES('${tweet}',${dbUserId.user_id},'${new Date()}');`;
    await db.run(tweetQuery);
    response.send("Created a Tweet");
  } catch (e) {
    console.log(e.message);
  }
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateMiddle,
  async (request, response) => {
    try {
      const { tweetId } = request.params;
      const { username } = request;
      const getQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;
      const dbUserId = await db.get(getQuery);
      const tweetQuery = `
    SELECT *
    FROm tweet 
    WHERE tweet_id = ${tweetId};`;
      const idTweet = await db.get(tweetQuery);
      if (dbUserId.user_id === idTweet.user_id) {
        const deletQuery = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`;
        await db.run(deletQuery);
        response.send("Tweet Removed");
      } else {
        response.status(401);
        response.send("Invalid Request");
      }
    } catch (e) {
      console.log(e.message);
    }
  }
);

module.exports = app;
