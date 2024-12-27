"use strict";
const express = require("express");
const router = express.Router();
const config = require("../config");
const utils = require("./utils");
const logger = require("./logger");
const errors = require("./errors");
const { LisenceManager } = require("./lisenceManagement");
const { verifyLicense } = require("../examples/client");
const multiparty = require("multiparty");
class Handler {
  async handleLicense(req, res) {
    if (!utils.attrsNotNull(req.body, ["key", "id"]))
      return res.json({ status: errors.BAD_REQUEST });
    const { key, id: machine } = req.body;
    const data = LisenceManager.validate(key);
    if (!data) return res.json({ status: errors.INVALID_INPUT });

    if (!config.stateless) {
      const licenseKey = await LisenceManager.fetch(key);
      if (!licenseKey || licenseKey.revoked == 1) {
        logger.error(`Failed to check the license key in databaes: ${key}`);
        return res.json({ status: errors.NULL_DATA });
      }

      let success = await LisenceManager.authorize(key, machine);
      if (licenseKey.machine === machine) success = true;
      if (!success) {
        logger.error(`Used key encountered: ${key}, ${machine}`);
        return res.json({ status: errors.DUPLICATE_DATA });
      }
    }
    const license = await LisenceManager.generateLicense(key, machine);
    return res.json({ status: errors.SUCCESS, license });
  }

  async issue(options = {}) {
    return LisenceManager.issue(options);
  }

  async revoke(key) {
    return LisenceManager.revoke(key);
  }

  async getAllKeys() {
    try {
      const keys = await LisenceManager.fetchAll();

      console.log({ keys });

      return keys;
    } catch (error) {
      logger.error("Error fetching keys:", error);
      throw error;
    }
  }
}

const handler = new Handler();

// For licensing
router.post("/license", handler.handleLicense);

// Get all keys
router.get("/keys", async (req, res) => {
  try {
    const keys = await handler.getAllKeys();

    res.json({ status: errors.SUCCESS, keys: keys });
  } catch (err) {
    logger.error(err);
    res.json({ status: errors.SERVER_ERROR, keys: [] });
  }
});

// Create new key
router.post("/keys", async (req, res) => {
  try {
    console.log(req.body, "body");
    const key = await handler.issue(req.body);
    const keys = await handler.getAllKeys(); // Fetch updated list
    res.json({ status: errors.SUCCESS, keys, key });
  } catch (err) {
    logger.error(err);
    res.json({ status: errors.SERVER_ERROR, keys: [] });
  }
});

// Revoke key
router.post("/keys/:key/revoke", async (req, res) => {
  try {
    await handler.revoke(req.params.key);
    const keys = await handler.revoke(); // Fetch updated list
    res.json({ status: errors.SUCCESS, keys: keys });
  } catch (err) {
    console.log({ err });
    logger.error(err);
    res.json({ status: errors.SERVER_ERROR, keys: [] });
  }
});

router.post("/verify/license", async (req, res) => {
  try {
    const form = new multiparty.Form();

    form.parse(req, async function (err, fields, files) {
      if (err) {
        console.log(err, "Error parsing form");
        return res.status(400).json({
          status: "ERROR",
          message: "Error parsing form data",
        });
      }
      try {
        const data = await verifyLicense(files);
        return res.json({
          status: "SUCCESS",
          message: "License verified successfully",
          data,
        });
      } catch (error) {
        return res.status(500).json({
          status: "ERROR",
          message: "Failed to verify license",
          error: error.message || error,
        });
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: "SERVER_ERROR",
      message: "Failed to verify license",
      error: error.message || error,
    });
  }
});

module.exports = { router, handler };
