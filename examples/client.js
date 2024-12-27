"use strict";
const config = require("../config");
const md = require("machine-digest");
const fetch = require("node-fetch");
const fs = require("fs");
const logger = require("../src/logger");
const utils = require("../src/utils");

md.secret = "client software";

const licenseServer = "http://localhost:4001/v1/license";

const PublicKey = fs.readFileSync(config.rsa_public_key).toString();

const checkLicense = async (pathToKey, pathToLicense) => {
  console.log(pathToKey, pathToLicense);
  logger.info(`verifying license key:${pathToKey} license:${pathToLicense}`);
  let status = false;

  while (!status) {
    try {
      return _checkLicense(pathToKey, pathToLicense);
    } catch (e) {
      logger.error(e.toString());
      logger.error(
        "Failed to verfiy software license, please check your license key and license file"
      );
      return new Error(e)?.message ?? "Something went wrong!";
    }
  }
};

const _checkLicense = async (pathToKey, pathToLicense) => {
  const licenseKey = fs.readFileSync(pathToKey).toString().replace("\n", "");

  const machineId = md.get().digest;

  let _license;
  try {
    _license = fs.readFileSync(pathToLicense).toString().replace("\n", "");
  } catch (e) {
    logger.warn("Failed to load license file, fetching from license server");
    const params = {
      method: "POST",
      body: JSON.stringify({ id: machineId, key: licenseKey }),
      headers: { "Content-Type": "application/json" },
    };
    logger.info(params);
    const res = await fetch(licenseServer, params);
    const resData = await res.json();
    logger.info(resData);
    if (resData.status !== 0) {
      throw Error(
        "Failed to get license from server!, error code: " + resData.status
      );
    }
    _license = resData.license;
    fs.writeFileSync("license.txt", resData.license, "utf8");
  }

  const buf = Buffer.from(_license, "hex");
  const license = JSON.parse(utils.crypt(PublicKey, buf, false).toString());
  logger.debug(license);

  if (
    license.key === licenseKey &&
    license.machine === machineId &&
    license.identity === config.identity
  ) {
    if (
      license.meta.persist ||
      (license.meta.startDate < Date.now() && license.meta.endDate > Date.now())
    ) {
      return true;
    } else throw Error("invalid effect date of license");
  } else throw Error("invalid license");
};

const start = async (filesData) => {
  logger.info("Verified license successfully, ready to start now...");
  return await checkLicense(filesData.key[0].path, filesData.license[0].path);
};

module.exports = { verifyLicense: start };
