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

pragma solidity ^0.4.18;

import "./ERC20.sol";
import "./TransferAndCallReceiver.sol";

contract LikeCoin is ERC20 {
    string constant public name = "LikeCoin";
    string constant public symbol = "LIKE";

    // Synchronized to Ether -> Wei ratio, which is important
    uint8 constant public decimals = 18;

    uint256 public supply = 0;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

    address public owner = 0x0;
    address public pendingOwner = 0x0;
    address public operator = 0x0;
    address public crowdsaleAddr = 0x0;
    address public contributorPoolAddr = 0x0;
    address[] public userGrowthPoolAddrs;
    mapping (address => bool) isUserGrowthPool;
    mapping (address => bool) userGrowthPoolMinted;
    mapping(address => uint256) public lockedBalances;
    uint public unlockTime = 0;
    bool public allowDelegate = true;
    mapping (address => mapping (uint256 => bool)) public usedNonce;
    mapping (address => bool) public transferAndCallWhitelist;

    event Lock(address indexed _addr, uint256 _value);
    event OwnershipChanged(address _newOwner);

    function LikeCoin(uint256 _initialSupply) public {
        owner = msg.sender;
        supply = _initialSupply;
        balances[owner] = _initialSupply;
        Transfer(0x0, owner, _initialSupply);
    }

    function changeOwner(address _pendingOwner) public {
        require(msg.sender == owner);
        require(_pendingOwner != owner);
        pendingOwner = _pendingOwner;
    }

    function acceptOwnership() public {
        require(msg.sender == pendingOwner);
        owner = pendingOwner;
        pendingOwner = 0x0;
        OwnershipChanged(owner);
    }

    function setOperator(address _operator) public {
        require(msg.sender == owner);
        require(_operator != operator);
        operator = _operator;
    }

    function totalSupply() public constant returns (uint256) {
        return supply;
    }

    function balanceOf(address _owner) public constant returns (uint256 balance) {
        return balances[_owner] + lockedBalances[_owner];
    }

    function _tryUnlockBalance(address _from) internal {
        if (unlockTime != 0 && now >= unlockTime && lockedBalances[_from] > 0) {
            balances[_from] += lockedBalances[_from];
            delete lockedBalances[_from];
        }
    }

    function _transfer(address _from, address _to, uint256 _value) internal returns (bool success) {
        _tryUnlockBalance(_from);
        require(balances[_from] >= _value);
        require(balances[_to] + _value >= balances[_to]);
        balances[_from] -= _value;
        balances[_to] += _value;
        Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) public returns (bool success) {
        return _transfer(msg.sender, _to, _value);
    }

    function transferAndLock(address _to, uint256 _value) public returns (bool success) {
        require(now < unlockTime);
        require(msg.sender == crowdsaleAddr || msg.sender == owner || msg.sender == operator);
        require(balances[msg.sender] >= _value);
        require(lockedBalances[_to] + _value > lockedBalances[_to]);
        balances[msg.sender] -= _value;
        lockedBalances[_to] += _value;
        Transfer(msg.sender, _to, _value);
        Lock(_to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        require(allowed[_from][msg.sender] >= _value);
        _transfer(_from, _to, _value);
        allowed[_from][msg.sender] -= _value;
        return true;
    }

    function _transferMultiple(address _from, address[] _addrs, uint256[] _values) internal returns (bool success) {
        require(_addrs.length > 0);
        require(_values.length == _addrs.length);
        _tryUnlockBalance(_from);
        uint256 total = 0;
        for (uint i = 0; i < _addrs.length; ++i) {
            address addr = _addrs[i];
            uint256 value = _values[i];
            uint256 balance = balances[addr];
            require(balance + value >= balance);
            require(total + value >= total);
            balance += value;
            total += value;
            balances[addr] = balance;
            Transfer(_from, addr, value);
        }
        require(balances[_from] >= total);
        balances[_from] -= total;
        return true;
    }

    function transferMultiple(address[] _addrs, uint256[] _values) public returns (bool success) {
        return _transferMultiple(msg.sender, _addrs, _values);
    }

    function _isContract(address _addr) internal constant returns (bool) {
        uint256 length;
        assembly {
            length := extcodesize(_addr)
        }
        return (length > 0);
    }

    function _transferAndCall(address _from, address _to, uint256 _value, bytes _data) internal returns (bool success) {
        require(_isContract(_to));
        require(transferAndCallWhitelist[_to]);
        require(_transfer(_from, _to, _value));
        TransferAndCallReceiver(_to).tokenCallback(_from, _value, _data);
        return true;
    }

    function transferAndCall(address _to, uint256 _value, bytes _data) public returns (bool success) {
        return _transferAndCall(msg.sender, _to, _value, _data);
    }

    function _bytesToSignature(bytes sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65);
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := and(mload(add(sig, 65)), 0xFF)
        }
        return (v, r, s);
    }

    bytes32 transferAndCallDelegatedHash = keccak256("address contract", "string method", "address to", "uint256 value", "bytes data", "uint256 maxReward", "uint256 nonce");
    function transferAndCallDelegatedRecover(
        address _to,
        uint256 _value,
        bytes _data,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (address) {
        bytes32 hash = keccak256(transferAndCallDelegatedHash, keccak256(this, "transferAndCallDelegated", _to, _value, _data, _maxReward, _nonce));
        var (v, r, s) = _bytesToSignature(_signature);
        return ecrecover(hash, v, r, s);
    }

    function transferAndCallDelegated(
        address _from,
        address _to,
        uint256 _value,
        bytes _data,
        uint256 _maxReward,
        uint256 _claimedReward,
        uint256 _nonce,
        bytes _signature
    ) public returns (bool success) {
        require(allowDelegate);
        require(_claimedReward <= _maxReward);
        require(transferAndCallDelegatedRecover(_to, _value, _data, _maxReward, _nonce, _signature) == _from);
        require(!usedNonce[_from][_nonce]);
        usedNonce[_from][_nonce] = true;
        require(_transfer(_from, msg.sender, _claimedReward));
        return _transferAndCall(_from, _to, _value, _data);
    }

    bytes32 transferMultipleDelegatedHash = keccak256("address contract", "string method", "address[] addrs", "uint256[] values", "uint256 maxReward", "uint256 nonce");
    function transferMultipleDelegatedRecover(
        address[] _addrs,
        uint256[] _values,
        uint256 _maxReward,
        uint256 _nonce,
        bytes _signature
    ) public constant returns (address) {
        bytes32 hash = keccak256(transferMultipleDelegatedHash, keccak256(this, "transferMultipleDelegated", _addrs, _values, _maxReward, _nonce));
        var (v, r, s) = _bytesToSignature(_signature);
        return ecrecover(hash, v, r, s);
    }

    function transferMultipleDelegated(
        address _from,
        address[] _addrs,
        uint256[] _values,
        uint256 _maxReward,
        uint256 _claimedReward,
        uint256 _nonce,
        bytes _signature
    ) public returns (bool success) {
        require(allowDelegate);
        require(_claimedReward <= _maxReward);
        require(transferMultipleDelegatedRecover(_addrs, _values, _maxReward, _nonce, _signature) == _from);
        require(!usedNonce[_from][_nonce]);
        usedNonce[_from][_nonce] = true;
        require(_transfer(_from, msg.sender, _claimedReward));
        return _transferMultiple(_from, _addrs, _values);
    }

    function switchDelegate(bool _allowed) public {
        require(msg.sender == owner || msg.sender == operator);
        require(allowDelegate != _allowed);
        allowDelegate = _allowed;
    }

    function addTransferAndCallWhitelist(address _contract) public {
        require(msg.sender == owner || msg.sender == operator);
        require(_isContract(_contract));
        require(!transferAndCallWhitelist[_contract]);
        transferAndCallWhitelist[_contract] = true;
    }

    function removeTransferAndCallWhitelist(address _contract) public {
        require(msg.sender == owner || msg.sender == operator);
        require(transferAndCallWhitelist[_contract]);
        delete transferAndCallWhitelist[_contract];
    }

    function approve(address _spender, uint256 _value) public returns (bool success) {
        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) public constant returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    function burn(uint256 _value) public {
        require(supply >= _value);
        require(balances[msg.sender] >= _value);
        balances[msg.sender] -= _value;
        supply -= _value;
        Transfer(msg.sender, 0x0, _value);
    }

    function registerCrowdsales(address _crowdsaleAddr, uint256 _value, uint256 _privateFundUnlockTime) public {
        require(msg.sender == owner);
        require(crowdsaleAddr == 0x0);
        require(_crowdsaleAddr != 0x0);
        require(_privateFundUnlockTime > now);
        require(supply + _value > supply);
        unlockTime = _privateFundUnlockTime;
        crowdsaleAddr = _crowdsaleAddr;
        supply += _value;
        balances[_crowdsaleAddr] += _value;
        Transfer(0x0, crowdsaleAddr, _value);
    }

    function registerContributorPool(address _contributorPoolAddr, uint256 _value) public {
        require(msg.sender == owner);
        require(contributorPoolAddr == 0x0);
        require(_contributorPoolAddr != 0x0);
        require(supply + _value > supply);
        contributorPoolAddr = _contributorPoolAddr;
        supply += _value;
        balances[contributorPoolAddr] += _value;
        Transfer(0x0, contributorPoolAddr, _value);
    }

    function registerUserGrowthPools(address[] _poolAddrs) public {
        require(msg.sender == owner);
        require(userGrowthPoolAddrs.length == 0);
        require(_poolAddrs.length > 0);
        for (uint i = 0; i < _poolAddrs.length; ++i) {
            userGrowthPoolAddrs.push(_poolAddrs[i]);
            isUserGrowthPool[_poolAddrs[i]] = true;
        }
    }

    function mintForUserGrowthPool(uint256 _value) public {
        require(isUserGrowthPool[msg.sender]);
        require(!userGrowthPoolMinted[msg.sender]);
        require(supply + _value > supply);
        userGrowthPoolMinted[msg.sender] = true;
        supply += _value;
        balances[msg.sender] += _value;
        Transfer(0x0, msg.sender, _value);
    }
}
