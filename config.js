'use strict'
module.exports = {
  name: 'node-license-server',
  identity: 'ClientSoftware',     // client software identity
  stateless: false,
  redis: 'redis://redis:6379',
  rsa_private_key: "sample.private.pem",
  rsa_public_key: "sample.public.pem",
  rsa_passphrase: "1234"
}