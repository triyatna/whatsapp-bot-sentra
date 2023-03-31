const {
  default: makeWASocket,
  DisconnectReason,
  useSingleFileAuthState,
  Browsers,
  isJidUser,
  isJidGroup,
  makeInMemoryStore,
  jidNormalizedUser,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  toBuffer,
  getContentType,
  jidDecode,
  delay,
  isJidStatusBroadcast,
  useMultiFileAuthState,
  getDevice,
} = require("@adiwajshing/baileys");
const { Boom } = require("./node_modules/@hapi/boom");
const pino = require("pino");
var fs = require("fs");
var path = require("path");
let package = require("./package.json");
// Setting Server
require("dotenv").config();
let express = require("express");
const bodyParser = require("body-parser");
const app = express();
const http = require("http"); // if u use https : example http://123.456.7.890:port
const https = require("https"); // if u use https : example https://123.456.7.890:port
// This a valid key SSL, used if you use https on your endpoint
// const options = {
//   key: fs.readFileSync(
//     "/etc/letsencrypt/live/server.sentrawidyatama.my.id/privkey.pem"
//   ),
//   cert: fs.readFileSync(
//     "/etc/letsencrypt/live/server.sentrawidyatama.my.id/fullchain.pem"
//   ),
// };
// const httpServer = https.createServer(options, app);
const httpServer = http.createServer(app);
const io = require("socket.io")(httpServer);
const cors = require("cors");
app.use(
  cors({
    origin: "*",
  })
);
app.use(bodyParser.json({ limit: "100mb" })); // for parsing application/json
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "100mb",
    parameterLimit: 100000,
  })
); // for parsing application/x-www-form-urlencoded

app.set("json spaces", 2);
app.use(express.json());
const d = new Date();
// let time = d.toISOString().slice(0, 19).replace("T", " ");
let time = Date.now();
const msgRetryCounterMap = {};
const store = makeInMemoryStore({
  logger: pino().child({ level: "silent", stream: "store" }),
});

store.readFromFile("./sessions/baileys_store_multi.json");
// save every 10s
setInterval(() => {
  store.writeToFile("./sessions/baileys_store_multi.json");
}, 10_000);
global.store = store;
console.log("Starting...");
/** DB */
if (!fs.existsSync("./core/usersJid.json")) {
  fs.writeFileSync("./core/usersJid.json", JSON.stringify([]), "utf-8");
}
const {
  groupManage,
  mediaMessageManage,
  APImediaManage,
  IPwhitelistManage,
} = require("./core/database");
// Whitelist API
let ipwhite;
const Database = require("better-sqlite3");
const db = new Database("./core/database.db", { verbose: null });
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const mysql = require("mysql2");
const dbs = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: "utf8mb4",
  multipleStatements: true,
  timezone: "+07:00",
});
dbs.connect();
const { JsonDB } = require("node-json-db");
const { Config } = require("node-json-db/dist/lib/JsonDBConfig");
let dbj = new JsonDB(new Config("./core/sentradb", true, true, "/"));
let chatsJid = JSON.parse(fs.readFileSync("./core/usersJid.json", "utf-8"));
const {
  getRandom,
  download,
  parseMention,
  secondsConvert,
  humanFileSize,
  times,
  processTime,
} = require("./lib/function");
const { Serialize } = require("./lib/serialize");
const multer = require("multer");
const memo = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, "api-" + Date.now() + "-" + file.originalname);
  },
});
const filefilter = (req, file, cb) => {
  if (
    file.mimetype === "video/mp4" ||
    file.mimetype === "application/pdf" ||
    file.mimeType === "image/*"
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
  cb(new Error("I don't have a clue!"));
};
const upload = multer({
  storage: memo,
  filefilter: filefilter,
});

/**   */
const START_TIME = Date.now();
fs.writeFileSync("./core/start.txt", START_TIME.toString());
const qrcode = require("qrcode");
const si = require("systeminformation");
// let session;
let session = "sessions/main";
// const dbygy = db.prepare("SELECT * FROM device");
// const mcekphonedvc = dbygy.all();
// mcekphonedvc.forEach((e) => {
//   session = `sessions/${e.phone}`;
// });
const start = async () => {
  const { version: WAVersion, isLatest } = await fetchLatestBaileysVersion();
  const LAUNCH_TIME_MS = Date.now() - START_TIME;
  const { state, saveCreds } = await useMultiFileAuthState(session);
  let client = makeWASocket({
    version: WAVersion,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    msgRetryCounterMap,
    auth: state,
    browser: Browsers.macOS("Chrome"),
  });
  global.client = client;

  store?.bind(client.ev);
  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (global.qr !== update.qr) {
      global.qr = update.qr;
      if (global.qr !== undefined) {
        qrcode.toDataURL(global.qr, function (err, url) {
          console.log(url);
          io.on("connection", (socket) => {
            io.emit("qr", { url: url, stats: global.qr });
          });
        });
      }
    }

    if (connection === "connecting") {
      console.log("Connecting...");
    } else if (connection === "close") {
      const log = (msg) => console.log(msg);
      const statusCode = new Boom(lastDisconnect?.error)?.output.statusCode;
      console.log(lastDisconnect.error);
      if (statusCode === DisconnectReason.badSession) {
        log(`Bad session file, delete ${session} and run again`);
        start();
      } else if (statusCode === DisconnectReason.connectionClosed) {
        log("Connection closed, reconnecting....");
        start();
      } else if (statusCode === DisconnectReason.connectionLost) {
        log("Connection lost, reconnecting....");
        start();
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        log(
          "Connection Replaced, Another New Session Opened, Please Close Current Session First"
        );
        process.exit();
      } else if (statusCode === DisconnectReason.loggedOut) {
        log(`Device Logged Out, Please Delete ${session} and Scan Again.`);
        fs.rm(session, { recursive: true }, (err) => {
          if (err) {
            // File deletion failed
            console.error(err.message);
            return;
          }
          console.log("File deleted successfully");
        });
        start();
      } else if (statusCode === DisconnectReason.restartRequired) {
        log("Restart required, restarting...");
        start();
      } else if (statusCode === DisconnectReason.timedOut) {
        log("Connection timedOut, reconnecting...");
        start();
      } else {
        // console.log(lastDisconnect.error);
        start();
      }
    } else if (connection === "open") {
      console.log("is now Connected...");
      const clientss = client.user;
      try {
        var ppUrl = await client.profilePictureUrl(client.user.id, "image");
      } catch (e) {
        var ppUrl = e;
      }
      const busines = await client.getBusinessProfile(client.user.id);
      const data = { clientss, ppUrl, busines };
    }
  });

  client.ev.on("creds.update", saveCreds);

  client.ev.on("messages.upsert", async (msg) => {
    try {
      if (!msg.messages) return;
      const m = msg.messages[0];
      if (!m.message) return;
      if (m.key.fromMe) return;
      if (m.key && isJidStatusBroadcast(m.key.remoteJid)) return;
      const from = m.key.remoteJid;
      const number = from.replace("@s.whatsapp.net", "");
      const device = getDevice(m.key.id);
      const more = String.fromCharCode(8206);
      const readMore = more.repeat(4000);
      let type = (client.msgType = getContentType(m.message));
      let t = (client.timestamp = m.messageTimestamp);
      const body =
        type === "conversation"
          ? m.message.conversation
          : type == "imageMessage"
          ? m.message.imageMessage.caption
          : type == "documentMessage" && m.message.documentMessage.caption
          ? m.message.documentMessage.caption
          : type == "videoMessage"
          ? m.message.videoMessage.caption
          : type == "extendedTextMessage"
          ? m.message.extendedTextMessage.text
          : type == "buttonsResponseMessage"
          ? m.message.buttonsResponseMessage.selectedButtonId
          : type == "listResponseMessage"
          ? m.message.listResponseMessage.singleSelectReply.selectedRowId
          : type == "templateButtonReplyMessage"
          ? m.message.templateButtonReplyMessage.selectedId
          : type === "messageContextInfo"
          ? m.message.listResponseMessage.singleSelectReply.selectedRowId ||
            m.message.buttonsResponseMessage.selectedButtonId ||
            m.text
          : "";
      let isGroupMsg = isJidGroup(from);
      let sender = m.sender;
      let pushname = (client.pushname = m.pushName);
      const botNumber = jidNormalizedUser(client.user.id);
      let groupMetadata = isGroupMsg
        ? store?.groupMetadata[from] !== undefined
          ? store.groupMetadata[from]
          : await store.fetchGroupMetadata(from, client)
        : {};
      let groupMembers = isGroupMsg ? groupMetadata.participants : [];
      let groupAdmins = groupMembers
        .filter((v) => v.admin !== null)
        .map((x) => x.id);
      let formattedTitle = isGroupMsg ? groupMetadata.subject : "";
      Serialize(client, m);
      if (isGroupMsg) {
        groupManage.add(from, formattedTitle);
        dbs.reload();
      }
      // if (await mediaMessageManage.getAll()) {
      //   console.log(await mediaMessageManage.getAll());
      // }
      const typing = async (jid) =>
        await client.sendPresenceUpdate("composing", jid);
      const recording = async (jid) =>
        await client.sendPresenceUpdate("recording", jid);
      const waiting = async (jid, m) =>
        await client.sendMessage(jid, { text: "Process..." }, { quoted: m });
      // download media message
      client.downloadMediaMessage = downloadMediaMessage;
      /**
       *
       * @param {any} message
       * @returns
       */
      async function downloadMediaMessage(message) {
        let mimes = (message.msg || message).mimetype || "";
        let messageType = mimes.split("/")[0].replace("application", "document")
          ? mimes.split("/")[0].replace("application", "document")
          : mimes.split("/")[0];
        let extension = mimes.split("/")[1];
        const stream = await downloadContentFromMessage(message, messageType);
        return await toBuffer(stream);
      }
      if (type == "documentMessage" || type == "imageMessage") {
        let q = m.quoted ? m.quoted : m;
        let mediaResult = JSON.parse(JSON.stringify(q.msg));
        let mimetty = mediaResult.mimetype.substr(
          0,
          mediaResult.mimetype.indexOf("/")
        );
        // console.log(q.pushName);
        // console.log(mediaResult);
        if (mimetty == "image") {
          if (!mediaResult.title) {
            let thumb = await q.download();
            let linkurl = `IMAGE_${pushname}-${from}-${Date.now()}`;
            fs.writeFileSync(`./uploads/messages/${linkurl}.png`, thumb);
            mediaMessageManage.add(
              mediaResult,
              linkurl + ".png",
              from,
              pushname,
              q.device
            );
          }
        } else if (mimetty == "application") {
          let thumb = await q.download();
          let linkurl = `FILE_${pushname}-${from}-${Date.now()}`;
          fs.writeFileSync(
            `./uploads/messages/${linkurl}-${mediaResult.title}`,
            thumb
          );
          mediaMessageManage.add(
            mediaResult,
            `${linkurl}-${mediaResult.title}`,
            from,
            pushname,
            q.device
          );
        }
      }

      global.reply = async (text) => {
        await client.sendPresenceUpdate("composing", from);
        return client.sendMessage(from, { text }, { quoted: m });
      };
      global.sendText = async (text) => {
        await client.sendPresenceUpdate("composing", from);
        return client.sendMessage(from, { text });
      };
      global.locationText = async (lat, long) => {
        await client.sendPresenceUpdate("composing", from);
        return client.sendMessage(from, {
          location: {
            degreesLatitude: lat,
            degreesLongitude: long,
          },
        });
      };
      global.sendVCARD = async (fn, number, org) => {
        await client.sendPresenceUpdate("composing", from);
        const vcard =
          "BEGIN:VCARD\n" + // metadata of the contact card
          "VERSION:3.0\n" +
          "FN:" +
          fn + // full name
          "\nORG:" +
          org + // the organization of the contact
          ";\nTEL;type=CELL;type=VOICE;waid=" +
          number +
          ":+" +
          number + // WhatsApp ID + phone number
          "\nEND:VCARD";
        return client.sendMessage(from, {
          contacts: {
            displayName: fn,
            contacts: [{ vcard }],
          },
        });
      };
      global.sendImageFromUrl = async (url, caption) => {
        await client.sendPresenceUpdate("composing", from);
        return client.sendMessage(from, {
          image: {
            url: url,
          },
          caption: caption,
        });
      };
      global.sendDocFromUrl = async (url, filename, type) => {
        await client.sendPresenceUpdate("composing", from);
        let mimeTypes;
        switch (type) {
          case "pdf":
            mimeTypes = "application/pdf";
            break;
          case "xls":
            mimeTypes = "application/excel";
            break;
          case "xlsx":
            mimeTypes =
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            break;
          case "docx":
            mimeTypes =
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            break;
          case "zip":
            mimeTypes = "application/zip";
            break;
          case "doc":
            mimeTypes = "application/msword";
            break;
        }
        return client.sendMessage(from, {
          document: {
            url: url,
          },
          fileName: filename,
          mimetype: mimeTypes,
        });
      };

      global.sendButton = async (text, array, footer, link) => {
        await client.sendPresenceUpdate("composing", from);
        const arrs = JSON.parse(array);
        const str = JSON.stringify(arrs.button);
        const arr = JSON.parse(str);
        let buttonsbtn;
        switch (arr.length) {
          case 1:
            buttonsbtn = [
              {
                buttonId: arr[0].data,
                buttonText: { displayText: arr[0].text },
                type: 1,
              },
            ];
            break;
          case 2:
            buttonsbtn = [
              {
                buttonId: arr[0].data,
                buttonText: { displayText: arr[0].text },
                type: 1,
              },
              {
                buttonId: arr[1].data,
                buttonText: { displayText: arr[1].text },
                type: 1,
              },
            ];
            break;
          case 3:
            buttonsbtn = [
              {
                buttonId: arr[0].data,
                buttonText: { displayText: arr[0].text },
                type: 1,
              },
              {
                buttonId: arr[1].data,
                buttonText: { displayText: arr[1].text },
                type: 1,
              },
              {
                buttonId: arr[2].data,
                buttonText: { displayText: arr[2].text },
                type: 1,
              },
            ];
            break;
          default:
            buttonsbtn = [
              {
                buttonId: "error",
                buttonText: { displayText: "error" },
                type: 1,
              },
            ];
        }
        let buttonMessage;
        switch (arrs.media) {
          case "yes":
            buttonMessage = {
              image: { url: link },
              caption: text,
              footer: footer,
              buttons: buttonsbtn,
              headerType: 4,
            };
            break;
          case "no":
            buttonMessage = {
              text: text,
              footer: footer,
              buttons: buttonsbtn,
              headerType: 1,
            };
            break;
          default:
            buttonMessage = {
              text: "error",
              footer: "error",
              buttons: buttonsbtn,
              headerType: 1,
            };
        }
        return client.sendMessage(from, buttonMessage);
      };
      global.sendList = async (text, array) => {
        const arrs = JSON.parse(array);
        const str = JSON.stringify(arrs.list);
        const arr = JSON.parse(str);
        const sections = arr;
        const listMessage = {
          text: text,
          footer: arrs.footer,
          title: arrs.title,
          buttonText: arrs.buttonText,
          sections,
        };

        client.sendMessage(from, listMessage);
      };
      const cmd = body.slice(1).trim().split(/ +/).shift().toLowerCase();
      const cht = body.substring(body.indexOf(" ") + 1);
      console.log(cht);
      switch (cmd) {
        case "ai":
          try {
            const completion = await openai.createCompletion({
              model: "text-davinci-002",
              prompt: cht,
              temperature: 0.3,
              max_tokens: 3000,
              top_p: 1.0,
              frequency_penalty: 0.0,
              presence_penalty: 0.0,
            });
            reply(completion.data.choices[0].text);
            console.log(completion.data.choices[0].text);
          } catch (error) {
            if (error.response) {
              console.log(error.response.status);
              console.log(error.response.data);
            } else {
              console.log(error.message);
            }
          }

          break;
      }

      // const rows = db.prepare("SELECT * FROM messages WHERE message = ?");
      // const msgss = rows.all(body);
      // msgss.forEach((v) => {
      dbs.query(
        `SELECT * FROM messages WHERE message ='${body}'`,
        (err, rows) => {
          rows.forEach((v) => {
            const arr = JSON.parse(v.array);
            const sta = JSON.parse(v.status);
            if (v.type == "text") {
              delay(v.delay).then(() => {
                sendText(v.text);
              });
            } else if (v.type == "reply") {
              delay(v.delay).then(() => {
                reply(v.text);
              });
            } else if (v.type == "location") {
              delay(v.delay).then(() => {
                locationText(arr.lat, arr.long);
              });
            } else if (v.type == "vcard") {
              delay(v.delay).then(() => {
                sendVCARD(arr.fn, arr.phone, arr.org);
              });
            } else if (v.type == "image") {
              delay(v.delay).then(() => {
                sendImageFromUrl(arr.url, v.text);
              });
            } else if (v.type == "document") {
              delay(v.delay).then(() => {
                sendDocFromUrl(arr.url, arr.filename, arr.type);
              });
            } else if (v.type == "button") {
              delay(v.delay).then(() => {
                sendButton(v.text, v.array, arr.footer, v.media);
              });
            } else if (v.type == "buttonimage") {
              delay(v.delay).then(() => {
                sendButton(v.text, v.array, arr.footer, v.media);
              });
            } else if (v.type == "list") {
              delay(v.delay).then(() => {
                sendList(v.text, v.array);
              });
            }
          });
        }
      );
    } catch (e) {
      console.log(e);
    }
  });
  if (process.env.CALL_BLOCK == "true") {
    client.ws.on("CB:call", async (call) => {
      if (call.content[0].tag == "offer") {
        const callerJid = call.content[0].attrs["call-creator"];
        const { version, platform, notify, t } = call.attrs;
        const caption = `Wahai _${
          notify || "Blok"
        }_ , kamu telah menelpon BOT pada *${moment(t * 1000).format(
          "LLL"
        )}* menggunakan device *${platform}*, sehingga kamu diblokir oleh bot secara otomatis!.`;
        await delay(3000);
        await client
          .sendMessage(callerJid, { text: caption })
          .then(async () => {
            await client.updateBlockStatus(callerJid, "block");
          });
      }
    });
  }
  client.ev.on("group-participants.update", async (sentra) => {
    try {
      const botNumber = client.user.id;
      let jid = sentra.id;
      let meta = await client.groupMetadata(jid);
      let participants = sentra.participants;
      let json = groupManage.get(jid);
      const dataview = await json;
      if (dataview.welcome.status) {
        for (let x of participants) {
          if (x == botNumber) return;
          let dp;
          try {
            dp = await client.profilePictureUrl(x, "image");
          } catch (error) {
            dp = "https://server.sentrawidyatama.my.id/src/sentra-meet.png";
          }
          let textAdd = dataview.welcome.msg
            .replace("@user", `@${jidDecode(x).user}`)
            .replace("{title}", meta.subject);
          let textRemove = dataview.leave.msg
            .replace("@user", `@${jidDecode(x).user}`)
            .replace("{title}", meta.subject);

          if (sentra.action == "add" && dataview.welcome.status) {
            if (textAdd.includes("{foto}")) {
              client.sendMessage(jid, {
                image: { url: dp },
                mentions: [x],
                caption: textAdd.replace("{foto}", ""),
              });
            } else {
              client.sendMessage(jid, { text: textAdd, mentions: [x] });
            }
          } else if (sentra.action == "remove" && dataview.leave.status) {
            if (textRemove.includes("{foto}")) {
              client.sendMessage(jid, {
                image: { url: dp },
                mentions: [x],
                caption: textRemove.replace("{foto}", ""),
              });
            } else {
              client.sendMessage(jid, { text: textRemove, mentions: [x] });
            }
          } else if (sentra.action == "promote") {
            client.sendMessage(jid, {
              image: { url: dp },
              mentions: [x],
              caption: `Selamat @${
                x.split("@")[0]
              } atas jabatan menjadi admin di *${meta.subject}*`,
            });
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
  // API Controller Message
  // Method Get
  app.get("/", async (req, res) => {
    try {
      let ipre = req.ip;
      ipre = ipre.replace("::ffff:", "");
      const ipwhite = await IPwhitelistManage.get(ipre);
      if (ipwhite == false)
        return res.status(403).json({
          status: false,
          code: 403,
          creator: "TY Studio Dev",
          message: "IP not allowed!",
        });
      let ram = await si.mem();
      let cpu = await si.cpuCurrentSpeed();
      let disk = await si.fsSize();
      let up = si.time();
      let persen = (ram.total / ram.used) * 100 - 100;
      let persend = (disk[0].size / disk[0].available) * 100 - 100;
      let json = {
        server_time: new Date(up.current).toLocaleString("jv"),
        uptime: times(up.uptime),
        ram: {
          free: humanFileSize(ram.free, true, 1),
          total: humanFileSize(ram.total, true, 1),
          used: humanFileSize(ram.used, true, 1),
          cached: humanFileSize(ram.cached, true, 1),
          perc: persen.toFixed(2),
        },
        cpu: cpu.avg + " Ghz",
        disk: {
          free: humanFileSize(disk[0].available, true, 1),
          total: humanFileSize(disk[0].size, true, 1),
          used: humanFileSize(disk[0].used, true, 1),
          perc: persend.toFixed(2),
        },
        chats: {
          total: store.chats.length,
          private: store.chats.filter((x) => isJidUser(x.id)).length,
          groups: store.chats.filter((x) => isJidGroup(x.id)).length,
        },
      };
      res.status(200).json({
        status: true,
        code: 200,
        creator: "TY Studio Dev",
        message: "Server is Running..",
        result: json,
      });
    } catch (error) {
      res.status(503).send(error);
    }
  });
  // for Check QR
  app.get("/api/scanqr/:number", async (req, res) => {
    let ipre = req.ip;
    ipre = ipre.replace("::ffff:", "");
    const ipwhite = await IPwhitelistManage.get(ipre);
    if (ipwhite == false)
      return res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        message: "IP not allowed!",
      });
    const { number } = req.params;
    const qrPrint = (qr) => {
      if (number) {
        return true;
      } else {
        return false;
      }
    };
    res.status(200).json({
      success: true,
      creator: "TY Studio Dev",
      message: "Success Get",
      result: process.env.API_KEY,
    });
  });

  app.get("/api/sendMessage", async (req, res, next) => {
    let ipre = req.ip;
    ipre = ipre.replace("::ffff:", "");
    const ipwhite = await IPwhitelistManage.get(ipre);
    if (ipwhite == false)
      return res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        message: "IP not allowed!",
      });
    const { api_key, phone, text } = req.query;
    if (!api_key)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "API Key is Wrong!",
      });
    if (!phone || !text)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Not valid data!",
      });
    if (api_key == process.env.API_KEY) {
      const from =
        phone.endsWith("@g.us") == true
          ? phone
          : phone.replace(/^0+/, "62").replace("+", "") + "@s.whatsapp.net";
      try {
        const data = await client.sendMessage(from, { text: text });
        res.status(200).json({
          success: true,
          creator: "TY Studio Dev",
          message: "Success Send Message",
          result: data,
        });
      } catch (e) {
        res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Error Request!",
          result: e,
        });
      }
    } else {
      res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "API Key is Wrong!",
      });
    }
  });

  // Method Post
  app.post("/api/sendMessage/type/:type", async (req, res) => {
    let ipre = req.ip;
    ipre = ipre.replace("::ffff:", "");
    const ipwhite = await IPwhitelistManage.get(ipre);
    if (ipwhite == false)
      return res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        message: "IP not allowed!",
      });
    const { api_key, phone, text } = req.body;
    if (!api_key)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "API Key is Wrong!",
      });
    if (!phone || !text)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Not valid data!",
      });
    const from =
      phone.endsWith("@g.us") == true
        ? phone
        : phone.replace(/^0+/, "62").replace("+", "") + "@s.whatsapp.net";

    const { type } = req.params;
    if (!type)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Error Request!",
      });
    if (api_key == process.env.API_KEY) {
      if (type == "text") {
        try {
          await client.sendPresenceUpdate("composing", from);
          const data = await client.sendMessage(from, { text: text });
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Send Message (text)",
            result: data,
          });
        } catch (e) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Request!",
            result: e,
          });
        }
      } else if (type == "image") {
        const { url } = req.body;
        if (!url)
          return res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Url empty!",
          });
        try {
          await client.sendPresenceUpdate("composing", from);
          const data = await client.sendMessage(from, {
            image: {
              url: url,
            },
            caption: text,
          });
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Send Message " + type,
            result: data,
          });
        } catch (e) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Request!",
            result: e,
          });
        }
      } else if (type == "button") {
        const { query } = req.body;
        if (!query)
          return res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Query for " + type + " is empty!",
          });
        try {
          await client.sendPresenceUpdate("composing", from);
          const arrs = JSON.parse(query);
          const str = JSON.stringify(arrs.button);
          const arr = JSON.parse(str);

          let buttonsbtn;
          switch (arr.length) {
            case 1:
              buttonsbtn = [
                {
                  buttonId: arr[0].data,
                  buttonText: { displayText: arr[0].text },
                  type: 1,
                },
              ];
              break;
            case 2:
              buttonsbtn = [
                {
                  buttonId: arr[0].data,
                  buttonText: { displayText: arr[0].text },
                  type: 1,
                },
                {
                  buttonId: arr[1].data,
                  buttonText: { displayText: arr[1].text },
                  type: 1,
                },
              ];
              break;
            case 3:
              buttonsbtn = [
                {
                  buttonId: arr[0].data,
                  buttonText: { displayText: arr[0].text },
                  type: 1,
                },
                {
                  buttonId: arr[1].data,
                  buttonText: { displayText: arr[1].text },
                  type: 1,
                },
                {
                  buttonId: arr[2].data,
                  buttonText: { displayText: arr[2].text },
                  type: 1,
                },
              ];
              break;
            default:
              buttonsbtn = [
                {
                  buttonId: "error",
                  buttonText: { displayText: "error" },
                  type: 1,
                },
              ];
          }
          let buttonMessage;
          switch (arrs.media) {
            case "yes":
              buttonMessage = {
                image: { url: arrs.link },
                caption: text,
                footer: arrs.footer,
                buttons: buttonsbtn,
                headerType: 4,
              };
              break;
            case "no":
              buttonMessage = {
                text: text,
                footer: arrs.footer,
                buttons: buttonsbtn,
                headerType: 1,
              };
              break;
            default:
              buttonMessage = {
                text: "error",
                footer: "error",
                buttons: buttonsbtn,
                headerType: 1,
              };
          }
          const data = await client.sendMessage(from, buttonMessage);

          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Send Message with " + type,
            result: data,
          });
        } catch (e) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Request!",
            result: e,
          });
        }
      } else if (type == "location") {
        const { lat, long } = req.body;
        if (!lat || !long)
          return res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Location detail for " + type + " is empty!",
          });
        try {
          await client.sendPresenceUpdate("composing", from);
          const data = await client.sendMessage(from, {
            location: {
              degreesLatitude: lat,
              degreesLongitude: long,
            },
          });
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Send Message with " + type,
            result: data,
          });
        } catch (e) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Request!",
            result: e,
          });
        }
      } else if (type == "vcard") {
        const { query } = req.body;
        if (!query)
          return res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Query for " + type + " is empty!",
          });
        try {
          const arrs = JSON.parse(query);
          await client.sendPresenceUpdate("composing", from);
          const vcard =
            "BEGIN:VCARD\n" + // metadata of the contact card
            "VERSION:3.0\n" +
            "FN:" +
            arrs.fullname + // full name
            "\nORG:Ashoka Uni;" +
            arrs.organzation + // the organization of the contact
            "\nTEL;type=CELL;type=VOICE;waid=" +
            arrs.number +
            ":+" +
            arrs.number +
            "\n" + // WhatsApp ID + phone number
            "END:VCARD";

          const data = await client.sendMessage(from, {
            contacts: {
              displayName: arrs.fullname,
              contacts: [{ vcard }],
            },
          });
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Send Message with " + type,
            result: data,
          });
        } catch (e) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Request!",
            result: e,
          });
        }
      } else if (type == "list") {
        const { query } = req.body;
        if (!query)
          return res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Query for " + type + " is empty!",
          });
        try {
          const arrs = JSON.parse(query);
          const str = JSON.stringify(arrs.list);
          const arr = JSON.parse(str);
          const sections = arr;
          const listMessage = {
            text: text,
            footer: arrs.footer,
            title: arrs.title,
            buttonText: arrs.buttonText,
            sections,
          };
          const data = await client.sendMessage(from, listMessage);

          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Send Message with " + type,
            result: data,
          });
        } catch (e) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Request!",
            result: e,
          });
        }
      }
    } else {
      res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "API Key is Wrong!",
      });
    }
  });

  // Generate QR Code
  app.post("/api/generateQR/:api_key", async (req, res) => {
    let ipre = req.ip;
    ipre = ipre.replace("::ffff:", "");
    const ipwhite = await IPwhitelistManage.get(ipre);
    const { text } = req.body;
    const { api_key } = req.params;
    if (!api_key)
      return res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        result: "Required API key!",
      });
    if (!text)
      return res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        result: "Required text value!",
      });
    if (api_key == process.env.API_KEY) {
      try {
        const qr = await qrcode.toDataURL(text);
        res.status(200).json({
          status: true,
          code: 200,
          creator: "TY Studio Dev",
          message: "Success Generate QR Code",
          result: qr,
        });
      } catch (err) {
        res.status(403).json({
          status: false,
          code: 403,
          creator: "TY Studio Dev",
          message: "Error Generate QR Code",
        });
      }
    } else {
      res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        message: "Invalid API Key!",
      });
    }
  });
};
start().catch(() => start());
// IPwhitelistManage
app.post("/api/ip_whitelist/:type/:ip", async (req, res) => {
  const { api_key } = req.headers;
  const { desc } = req.body;
  const { type, ip } = req.params;
  if (!api_key)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "API diperlukan",
    });
  if (!ip)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP diperlukan",
    });
  if (!type)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "Type diperlukan",
    });
  if (!desc)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "Description diperlukan",
    });
  if (api_key == process.env.API_KEY) {
    if (type == "add") {
      let ress = await IPwhitelistManage.add(req.ip, ip, desc);
      await dbj.reload();
      if (ress == false)
        return res.status(403).json({
          status: false,
          code: 403,
          creator: "TY Studio Dev",
          message: "IP Whitelist is empty!",
        });
      res.status(200).json({
        status: true,
        code: 200,
        creator: "TY Studio Dev",
        message: "Success Add IP Whitelist for " + ip,
        result: ress,
      });
    } else if (type == "del") {
      let ress = await IPwhitelistManage.delete(ip);
      await dbj.reload();
      if (ress == false)
        return res.status(403).json({
          status: false,
          code: 403,
          creator: "TY Studio Dev",
          message: "IP Whitelist is empty!",
        });

      res.status(200).json({
        status: true,
        code: 200,
        creator: "TY Studio Dev",
        message: "Success Delete IP Whitelist for " + ip,
        result: ress,
      });
    } else if (type == "res") {
      let ress = await IPwhitelistManage.getAll();
      await dbj.reload();
      if (ress == false)
        return res.status(403).json({
          status: false,
          code: 403,
          creator: "TY Studio Dev",
          message: "IP Whitelist is empty!",
        });
      res.status(200).json({
        status: true,
        code: 200,
        creator: "TY Studio Dev",
        message: "Success result IP Whitelist for " + ip,
        result: ress,
      });
    } else {
      res.status(403).json({
        status: false,
        code: 403,
        creator: "TY Studio Dev",
        message: "Type not found",
      });
    }
  } else {
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      result: "Invalid API key",
    });
  }
});
// Upload Media
app.post("/api/upload_file/:mime", upload.single("file"), async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });

  const { api_key } = req.headers;
  const { mime } = req.params;
  if (!api_key)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "API diperlukan",
    });
  if (!mime)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "Mimetype diperlukan",
    });
  if (api_key == process.env.API_KEY) {
    if (req.file) {
      let length = req.file.filename.indexOf(".");
      let ress = req.file.filename.substr(0, length) + "." + mime;
      let links = `/uploads/${ress}`;
      fs.rename(
        `${__dirname}/uploads/${req.file.filename}`,
        `${__dirname}/uploads/${ress}`,
        (error) => {}
      );
      APImediaManage.add(req.ip, ress, req.file, __dirname + links);
      // const { mimetype, size, filename } = req.file;
      res.status(200).json({
        success: true,
        message: "Upload File Success",
        result: { detail: req.file, url: __dirname + links },
      });
    } else {
      res.status(403).json({
        success: false,
        message: "Upload File Failed",
        message: "File not found",
      });
    }
  } else {
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "Invalid API key",
    });
  }
});

// API DATABASE MESSAGE BOT
app.post("/api/add_autoreply/:type", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { api_key } = req.body;
  const { type } = req.params;
  if (!type)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    const { message, text, delay } = req.body;
    if (!message)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Message for " + type + " is empty!",
      });
    if (!text)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Text for " + type + " is empty!",
      });
    if (!delay)
      return res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Delay for " + type + " is empty!",
      });

    // const stmt = db.prepare(
    //   "INSERT INTO messages VALUES (NULL,?, ?, ?, ?, ?, ?, ?, ?)"
    // );
    // const { status, array, media } = req.body;
    if (type == "text") {
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", "{}", type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            console.log(err);
          }
        }
      );
    } else if (type == "reply") {
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", "{}", type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "location") {
      const { array } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "vcard") {
      const { array } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "image") {
      const { array } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "document") {
      const { array } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "buttonimage") {
      const { array, url } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      if (!url)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "URL for " + type + " is empty!",
        });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, url, time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "button") {
      const { array } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else if (type == "list") {
      const { array } = req.body;
      if (!array)
        return res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Array for " + type + " is empty!",
        });
      // const info = dbs.query(
      //   "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
      //   [message, text, "{}", array, type, delay, "https://example.com", time]
      // );
      // res.status(200).json({
      //   success: true,
      //   creator: "TY Studio Dev",
      //   message: "Success Add Message with " + type,
      //   result: info,
      // });
      dbs.query(
        "INSERT INTO messages VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
        [message, text, "{}", array, type, delay, "https://example.com", time],
        function (err, results, fields) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Add Message with " + type,
            result: results,
          });
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error Request!",
              result: err,
            });
          }
        }
      );
    } else {
      res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Error Request!",
      });
    }
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});
// GET ALL MESSAGE
app.get("/api/get_all_autoreply", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { api_key } = req.query;
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    // const stmt = db.prepare("SELECT * FROM messages");
    // const data = stmt.all();
    dbs.query("SELECT * FROM messages", function (err, results, fields) {
      if (!err) {
        res.status(200).json({
          success: true,
          creator: "TY Studio Dev",
          message: "Success Get All Message",
          result: results,
        });
      }
      if (err) {
        res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Error Get All Message",
        });
      }
    });
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});

// Get All Media on Uploads Message Folder
app.get("/api/view_media_json/:type", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { type } = req.params;
  const { api_key } = req.query;
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    if (type == "messages") {
      let media = await mediaMessageManage.getAll();
      if (media) {
        res.status(200).json({
          success: true,
          creator: "TY Studio Dev",
          message: "Success Get All media on Messages Folder",
          result: media,
        });
      } else {
        res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Not Media Found!",
        });
      }
    } else if (type == "uploads") {
      let media = await APImediaManage.getAll();
      if (media) {
        res.status(200).json({
          success: true,
          creator: "TY Studio Dev",
          message: "Success Get All media on Uploads Folder",
          result: media,
        });
      } else {
        res.status(403).json({
          success: false,
          creator: "TY Studio Dev",
          message: "Not Media Found!",
        });
      }
    } else {
      res.status(403).json({
        success: false,
        creator: "TY Studio Dev",
        message: "Params not found!",
      });
    }
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});

// GET ALL ROWS by TABLE
app.get("/api/view_table/:table", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { table } = req.params;
  const { api_key } = req.query;
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (!table)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "No table set!",
    });
  if (api_key == process.env.API_KEY) {
    if (table) {
      dbs.query(`SELECT * FROM ${table}`, function (err, results, fields) {
        if (err) {
          console.log(err);
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error Get All data",
          });
        }
        if (!err) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success Get All data",
            result: results,
          });
        }
      });
    }
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});

// Delete
app.delete("/api/delete_autoreply/:id", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { api_key } = req.body;
  const { id } = req.params;
  if (!id)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    // const stmt = db.prepare("DELETE FROM messages WHERE id = ?");
    // const info = stmt.run(id);
    // res.status(200).json({
    //   success: true,
    //   creator: "TY Studio Dev",
    //   message: "Success Delete Message",
    //   result: info,
    // });
    if (id == "all") {
      dbs.query("DELETE FROM messages", function (err, results, fields) {
        if (!err) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success delete All Message",
            result: results,
          });
        }
        if (err) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error delete All Message",
          });
        }
      });
    } else {
      dbs.query(
        "DELETE FROM messages WHERE id IN (?)",
        [id],
        function (err, results, fields) {
          if (!err) {
            res.status(200).json({
              success: true,
              creator: "TY Studio Dev",
              message: "Success delete Message",
              result: results,
            });
          }
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error delete Message",
            });
          }
        }
      );
    }
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});

app.delete("/api/delete_database_rows/:table/:id", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { api_key } = req.body;
  const { id, table } = req.params;
  if (!id)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!table)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    if (id == "all") {
      dbs.query("DELETE FROM " + table, function (err, results, fields) {
        if (!err) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success delete All Message on table " + table,
            result: results,
          });
        }
        if (err) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error delete All Message on table " + table,
          });
        }
      });
    } else {
      dbs.query(
        `DELETE FROM ${table} WHERE id IN (?)`,
        [id],
        function (err, results, fields) {
          if (!err) {
            res.status(200).json({
              success: true,
              creator: "TY Studio Dev",
              message: "Success delete Message on table " + table,
              result: results,
            });
          }
          if (err) {
            res.status(403).json({
              success: false,
              creator: "TY Studio Dev",
              message: "Error delete Message on table " + table,
            });
          }
        }
      );
    }
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});
// Update by ID
app.put("/api/update_autoreply/:id", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { api_key, message, text, delay } = req.body;
  const { id } = req.params;
  if (!id)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    const d = new Date();
    let time = d.getTime();
    // const stmt = db.prepare(
    //   "UPDATE messages SET message = ?, text = ?, delay = ?, date = ? WHERE id = ?"
    // );
    // const info = stmt.run(message, text, delay, time, id);
    dbs.query(
      "UPDATE messages SET message = ?, text = ?, delay = ?, date = ? WHERE id = ?",
      [message, text, delay, time, id],
      function (err, results, fields) {
        if (!err) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success UPDATE Message",
            result: results,
          });
        }
        if (err) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error UPDATE Message",
          });
        }
      }
    );
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});

app.put("/api/update_table_rows/:table/:id", async (req, res) => {
  let ipre = req.ip;
  ipre = ipre.replace("::ffff:", "");
  const ipwhite = await IPwhitelistManage.get(ipre);
  if (ipwhite == false)
    return res.status(403).json({
      status: false,
      code: 403,
      creator: "TY Studio Dev",
      message: "IP not allowed!",
    });
  const { api_key, query } = req.body;
  const { id, table } = req.params;
  if (!id)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!table)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Error Request!",
    });
  if (!query)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Query not available",
    });
  if (!api_key)
    return res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "Invalid API Key!",
    });
  if (api_key == process.env.API_KEY) {
    dbs.query(
      `UPDATE ${table} SET ${query} WHERE id = ?`,
      [id],
      function (err, results, fields) {
        if (!err) {
          res.status(200).json({
            success: true,
            creator: "TY Studio Dev",
            message: "Success UPDATE Message",
            result: results,
          });
        }
        if (err) {
          res.status(403).json({
            success: false,
            creator: "TY Studio Dev",
            message: "Error UPDATE Message",
          });
        }
      }
    );
  } else {
    res.status(403).json({
      success: false,
      creator: "TY Studio Dev",
      message: "API Key is Wrong!",
    });
  }
});
//DB Query

// Run the server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`[INFO] Web api Server on port: ${PORT}`);
});
