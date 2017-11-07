#!/usr/bin/env node

const accounts = require("./accounts.json");
const TestRPC = require("ethereumjs-testrpc");
const server = TestRPC.server({accounts});
server.listen(8545);
