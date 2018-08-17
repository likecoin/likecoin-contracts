//    Copyright (C) 2017 LikeCoin Foundation Limited
//
//    This file is part of LikeCoin Smart Contract.
//
//    LikeCoin Smart Contract is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    LikeCoin Smart Contract is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with LikeCoin Smart Contract.  If not, see <http://www.gnu.org/licenses/>.

/* global Promise, web3 */

const accounts = require('./accounts.json');
const BigNumber = require('bignumber.js');
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

async function assertSolidityThrow(f, message) {
  try {
    await f();
  } catch (e) {
    if (/VM Exception while processing transaction/.test(e.message)) {
      return;
    }
    throw new Error(`${message} (${e.message})`);
  }
  throw new Error(`${message} (returned successfully)`);
}

function solidityEventPromise(eventSource, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const filter = eventSource.watch((err, event) => {
      if (!stopped) {
        filter.stopWatching();
        stopped = true;
      }
      if (err) {
        reject(err);
      } else {
        resolve(event);
      }
    });

    // If no timeout is set and the event is missed, the test will run forever
    if (timeout !== 0) {
      setTimeout(() => {
        if (!stopped) {
          filter.stopWatching();
          stopped = true;
          reject(new Error('event timeout'));
        }
      }, timeout);
    }
    return filter;
  });
}

function solidityEvent(callResult, eventName) {
  const logs = callResult.logs.filter(log => log.event === eventName);
  if (logs.length === 0) {
    throw new Error(`No event named ${eventName} found`);
  } else if (logs.length > 1) {
    throw new Error(`More than one event named ${eventName}`);
  }
  return logs[0];
}

function jsonRpc(method, ...params) {
  return new Promise((resolve, reject) =>
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method,
      params,
      id: Math.floor(Math.random() * 0xFFFFFFFF),
    }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    }));
}

async function testrpcIncreaseTime(seconds) {
  await jsonRpc('evm_increaseTime', seconds);
  await jsonRpc('evm_mine');
  return web3.eth.getBlock(web3.eth.blockNumber).timestamp;
}

async function setBalance(addr, balance) {
  const origBalance = web3.eth.getBalance(addr);
  if (origBalance.gt(balance)) {
    const toSend = origBalance.sub(balance);
    await web3.eth.sendTransaction({
      from: addr,
      to: accounts[accounts.length - 1].address,
      value: toSend,
      gasPrice: 0,
    });
  } else {
    const toSend = balance.sub(origBalance);
    await web3.eth.sendTransaction({
      from: accounts[accounts.length - 1].address,
      to: addr,
      value: toSend,
      gasPrice: 0,
    });
  }
}

const decimalFactor = new BigNumber(10).pow(18);

function coinsToCoinUnits(value) {
  return decimalFactor.times(value);
}

const types = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  TransferDelegatedData: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'maxReward', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
  TransferAndCallDelegatedData: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'maxReward', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
  TransferMultipleDelegatedData: [
    { name: 'addrs', type: 'address[]' },
    { name: 'values', type: 'uint256[]' },
    { name: 'maxReward', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

// Recursively finds all the dependencies of a type
function dependencies(primaryType, found = []) {
  if (found.includes(primaryType)) {
    return found;
  }
  if (types[primaryType] === undefined) {
    return found;
  }
  found.push(primaryType);
  types[primaryType].forEach((field) => {
    dependencies(field.type, found).forEach((dep) => {
      if (!found.includes(dep)) {
        found.push(dep);
      }
    });
  });
  return found;
}

function encodeType(primaryType) {
  // Get dependencies primary first, then alphabetical
  let deps = dependencies(primaryType);
  deps = deps.filter(t => t !== primaryType);
  deps = [primaryType].concat(deps.sort());

  // Format as a string with fields
  let result = '';
  deps.forEach((type) => {
    result += `${type}(${types[type].map(({ name, type: t }) => `${t} ${name}`).join(',')})`;
  });
  return result;
}

function typeHash(primaryType) {
  return ethUtil.sha3(encodeType(primaryType));
}

function encodeData(primaryType, data) {
  const encTypes = [];
  const encValues = [];

  // Add typehash
  encTypes.push('bytes32');
  encValues.push(typeHash(primaryType));

  // Add field contents
  types[primaryType].forEach((field) => {
    let value = data[field.name];
    if (field.type === 'string' || field.type === 'bytes') {
      encTypes.push('bytes32');
      value = ethUtil.sha3(value);
      encValues.push(value);
    } else if (types[field.type] !== undefined) {
      encTypes.push('bytes32');
      value = ethUtil.sha3(encodeData(field.type, value));
      encValues.push(value);
    } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
      // array field
      encTypes.push('bytes32');
      const parsedType = field.type.slice(0, field.type.lastIndexOf('['));
      if (types[parsedType] !== undefined) {
        value = ethUtil.sha3(value.map(item => encodeData(parsedType, item)).join(''));
      } else {
        const arrayTypes = new Array(value.length);
        arrayTypes.fill(parsedType);
        if (parsedType === 'string' || parsedType === 'bytes') {
          value = value.map(v => ethUtil.sha3(v));
        }
        value = ethUtil.sha3(abi.rawEncode(arrayTypes, value));
      }
      encValues.push(value);
    } else {
      encTypes.push(field.type);
      encValues.push(value);
    }
  });

  return abi.rawEncode(encTypes, encValues);
}

function structHash(primaryType, data) {
  return ethUtil.sha3(encodeData(primaryType, data));
}

function signHash(domainData, data, primaryType) {
  return ethUtil.sha3(Buffer.concat([
    Buffer.from('1901', 'hex'),
    structHash('EIP712Domain', domainData),
    structHash(primaryType, data),
  ]));
}

module.exports = {
  assertSolidityThrow,
  solidityEvent,
  solidityEventPromise,
  testrpcIncreaseTime,
  setBalance,
  coinsToCoinUnits,
  signHash,
};

// vim: set ts=2 sw=2:
