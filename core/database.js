const { JsonDB } = require("node-json-db");
const { Config } = require("node-json-db/dist/lib/JsonDBConfig");

var db = new JsonDB(new Config("./core/sentradb", true, true, "/"));
var dir = __dirname.replace("core", "");
let stats = {
  msgSent: 1,
  msgRecv: 1,
  filesize: 1,
};
if (db.exists("/stats")) db.push("/stats", stats);
if (db.exists("/groups"))
  db.push("/groups/123-456@g.us", {
    id: "123-456@g.us",
    groupName: "TY STUDIO DEV",
    mute: false,
  });

/**
 *
 * @param {string} prop
 * @param {Number} count
 */
exports.statistics = (prop, count = 1) => {
  if (db.exists(`/stats/${prop}`)) db.push(`/stats/${prop}`, count);
  let stat = db.getData(`/stats/${prop}`);
  db.push(`/stats/${prop}`, (stat += count));
};
exports.info = (path) => {
  if (db.exists(path)) throw `db ${path} not exists`;
  return db.getData(path);
};

exports.mediaMessageManage = {
  add: async (file, filename, jid, pushname, device) => {
    if (await db.exists(`/mediaMessage/file/${filename}`)) return false;
    let width;
    let height;
    if (!file.title) {
      width = file.width;
      height = file.height;
    } else {
      width = "document";
      height = "document";
    }
    let json = {
      from: {
        sender: pushname,
        phone: jid,
        device: device,
      },
      mimetype: file.mimetype,
      filename: filename,
      path: "uploads/messages/",
      url: `${dir}uploads/messages/${filename}`,
      size: {
        length: file.fileLength,
        height: height,
        width: width,
      },
      timestamp: new Date().getTime(),
    };
    db.push(`/mediaMessage/file/${filename}`, json);
    return json;
  },
  update: async (filename, args) => {
    db.push(`/mediaMessage/file/${filename}`, args);
  },
  getAll: async () => {
    if (!(await db.exists(`/mediaMessage/file/`))) return false;
    else return db.getData(`/mediaMessage/file/`);
  },
};

exports.APImediaManage = {
  add: async (ip, fname, file, url) => {
    if (await db.exists(`/MediaAPIresult/file/${fname}`)) return false;
    let json = {
      from: {
        ip_addr: ip,
      },
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      destination: file.destination,
      filename: file.filename,
      path: file.path,
      size: file.size,
      url: url,
      timestamp: new Date().getTime(),
    };
    db.push(`/MediaAPIresult/file/${fname}`, json);
    return json;
  },
  update: async (filename, args) => {
    db.push(`/MediaAPIresult/file/${filename}`, args);
  },
  getAll: async () => {
    if (!(await db.exists(`/MediaAPIresult/file/`))) return false;
    else return db.getData(`/MediaAPIresult/file/`);
  },
};

exports.IPwhitelistManage = {
  add: async (req, ip, desc) => {
    if (await db.exists(`/IPwhitelist/result/${ip}`)) return false;
    let json = {
      from: {
        ip_addr: req,
      },
      ip_addr: ip,
      description: desc,
      timestamp: new Date().getTime(),
    };
    db.push(`/IPwhitelist/result/${ip}`, json);
    return json;
  },
  update: async (filename, args) => {
    db.push(`/IPwhitelist/result/${ip}`, args);
  },
  get: async (ip) => {
    if (!(await db.exists(`/IPwhitelist/result/${ip}`))) return false;
    else return db.getData(`/IPwhitelist/result/${ip}`);
  },
  getAll: async () => {
    if (!(await db.exists(`/IPwhitelist/result`))) return false;
    else return db.getData(`/IPwhitelist/result`);
  },
  delete: async (ip) => {
    if (!(await db.exists(`/IPwhitelist/result/${ip}`))) return false;
    else return db.delete(`/IPwhitelist/result/${ip}`);
  },
};

exports.groupManage = {
  add: async (groupId, groupName) => {
    if (await db.exists(`/groups/${groupId}`)) return false;
    let json = {
      id: groupId,
      groupName,
      mute: false,
      welcome: {
        status: true,
        msg: "Welcome @user in group {title}",
      },
      leave: {
        status: true,
        msg: "Good bye @user",
      },
    };
    db.push(`/groups/${groupId}`, json);
    return json;
  },
  update: async (groupId, args) => {
    db.push(`/groups/${groupId}`, args);
  },
  get: async (groupId) => {
    if (!(await db.exists(`/groups/${groupId}`))) return false;
    else return db.getData(`/groups/${groupId}`);
  },
};
