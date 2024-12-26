const { createClient } = require("redis");
const errors = require("./errors");
const config = require("../config");
const utils = require("./utils");
const fs = require("fs");

const cached = {
  client: null,
};

const PrivateKey = {
  key: fs.readFileSync(config.rsa_private_key).toString(),
  passphrase: config.rsa_passphrase,
};

const PublicKey = fs.readFileSync(config.rsa_public_key).toString();

async function redisInit() {
  if (cached.client) return cached.client;
  const client = await createClient()
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  client.set();

  cached.client = client;
  return cached.client;
}

class LisceneKeyManager {
  DataKey = "SPECIAL_DATA_KEY";

  async fetchAll() {
    const redis = await redisInit();
    return JSON.parse((await redis.get(this.DataKey)) ?? "[]");
  }

  async fetch(key) {
    const all = await this.fetchAll();
    return all.find((d) => d.key === key);
  }

  async setData(data) {
    const redis = await redisInit();
    await redis.set(this.DataKey, JSON.stringify(data));
  }

  async issue(options = {}) {
    try {
      const meta = {
        identity: config.identity || "Software",
        persist: options.persist ? 1 : 0,
        startDate: options.startDate || Date.now(),
        endDate: options.endDate || Date.now() + config.expireAfter,
        issueDate: Date.now(),
      };
      const buf = Buffer.from(JSON.stringify(meta), "utf8");
      const key = utils.crypt(PrivateKey, buf, true).toString("hex");

      const data = { key, revoked: 0, issueDate: meta.issueDate };

      const currentKeys = await this.fetchAll();

      currentKeys.push(data);
      this.setData(currentKeys);
      return { status: errors.SUCCESS, data };
    } catch (error) {
      return { status: errors.FAILURE, data: JSON.stringify(error) };
    }
  }

  async revoke(key) {
    const currentKeys = await this.fetchAll();
    const updatedKeys = currentKeys.map((d) =>
      d.key === key ? { ...d, revoked: 1 } : d
    );
    await this.setData(updatedKeys);
    return { status: errors.SUCCESS };
  }

  async authorize(key, machine) {
    const keyData = await this.fetch(key);
    if (!key) return null;
    keyData.machine = machine;

    const allKeys = await this.fetchAll();
    const updatedKeys = allKeys.map((d) =>
      d.key == keyData.key ? keyData : d
    );
    await this.setData(updatedKeys);
    return keyData;
  }

  async validate(key) {
    try {
      const buf = Buffer.from(key, "hex");

      const _data = utils.crypt(PublicKey, buf, false);
      const data = JSON.parse(_data.toString("utf8"));

      if (data.identity === config.identity) {
        if (data.persist == 1) return data;
        else if (data.startDate < Date.now() && data.endDate > Date.now())
          return data;
      }
      logger.info(`Encountered invalid key ${_data}`);
    } catch (e) {
      logger.error(e.toString());
    }
  }

  async generateLicense(key, machine) {
    const license = {
      identity: config.identity,
      machine,
      key,
      meta: await this.validate(key),
    };
    const buf = Buffer.from(JSON.stringify(license), "utf8");
    const _license = utils.crypt(PrivateKey, buf, true);
    return _license.toString("hex");
  }
}

const LisenceManager = new LisceneKeyManager();

module.exports = { LisenceManager };
