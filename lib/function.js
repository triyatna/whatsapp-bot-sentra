const {
  S_WHATSAPP_NET,
  getHttpStream,
  toBuffer,
} = require("@adiwajshing/baileys");
const { fromBuffer } = require("file-type");
const { AxiosRequestConfig } = require("axios");
const fs = require("fs");
if (!fs.existsSync("./temp")) {
  fs.mkdirSync("./temp", { recursive: true });
}
/**
 * Get Time duration
 * @param  {Date} timestamp
 * @param  {Date} now
 */
const processTime = (timestamp, now) => {
  // timestamp => timestamp when message was received
  return moment.duration(now - moment(timestamp * 1000)).asSeconds();
};

const getRandom = (ext = "") => {
  return `${Math.floor(Math.random() * 10000)}.${ext}`;
};

/**
 * save file from url to local dir with automatic filename + ext
 * @param {string} url The url
 * @param {string} extension optional extension
 * @param {AxiosRequestConfig} optionsOverride You can use this to override the [axios request config](https://github.com/axios/axios#request-config)
 * @returns {Promise<Object>}
 */
const download = (url, extension, optionsOverride = {}) => {
  return new Promise(async (resolve, reject) => {
    try {
      let stream = await getHttpStream(url, optionsOverride);
      const buffer = await toBuffer(stream);
      const type = await fromBuffer(buffer);
      let filepath = `./temp/${new Date().getTime()}.${extension || type.ext}`;
      fs.writeFileSync(filepath, buffer.toString("binary"), "binary");
      let nganu = {
        filepath: filepath,
        mimetype: type.mime,
      };
      resolve(nganu);
    } catch (error) {
      console.log(error);
    }
  });
};

/**
 * Format bytes as human-readable text.
 * copied from -> https://stackoverflow.com/a/14919494
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 *
 * @return Formatted string.
 */
function humanFileSize(bytes, si = true, dp = 1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }

  const units = si
    ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + " " + units[u];
}

// source -> https://stackoverflow.com/a/52560608
function secondsConvert(seconds, hour = false) {
  const format = (val) => `0${Math.floor(val)}`.slice(-2);
  const hours = seconds / 3600;
  const minutes = (seconds % 3600) / 60;
  const res = hour ? [hours, minutes, seconds % 60] : [minutes, seconds % 60];

  return res.map(format).join(":");
}

/**
 * @internal
 * A convinience method to download the [[DataURL]] of a file
 * @param {string}input The url or path
 * @param {AxiosRequestConfig} optionsOverride You can use this to override the [axios request config](https://github.com/axios/axios#request-config)
 * @returns
 */
async function getBuffer(input, optionsOverride = {}) {
  try {
    if (fs.existsSync(input)) {
      return {
        mimetype: mime.lookup(input),
        buffer: fs.readFileSync(input),
      };
    } else {
      const response = await axios.get(input, {
        responseType: "arraybuffer",
        ...optionsOverride,
      });
      return {
        mimetype: response.headers["content-type"],
        buffer: response.data,
      };
    }
    // return Buffer.from(response.data, 'binary').toString('base64')
  } catch (error) {
    console.log("TCL: getDUrl -> error", error);
  }
}

function times(second) {
  days = Math.floor(second / 60 / 60 / 24);
  hours = Math.floor(second / 60 / 60);
  minute = Math.floor(second / 60);
  sec = Math.floor(second);
  return {
    days,
    hours,
    minute,
    sec,
  };
}

const parseMention = (text) =>
  [...text.matchAll(/@?([0-9]{5,16}|0)/g)].map((v) => v[1] + S_WHATSAPP_NET);

module.exports = {
  getRandom,
  download,
  parseMention,
  secondsConvert,
  humanFileSize,
  processTime,
  times,
  getBuffer,
};
