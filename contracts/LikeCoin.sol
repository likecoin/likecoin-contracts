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

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./SignatureChecker.sol";
import "./TransferAndCallReceiver.sol";
import "./HasOperator.sol";

contract LikeCoin is ERC20, HasOperator {
    using SafeMath for uint256;

    string constant public name = "LikeCoin";
    string constant public symbol = "LIKE";

    // Synchronized to Ether -> Wei ratio, which is important
    uint8 constant public decimals = 18;

    uint256 public supply = 0;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

    address public crowdsaleAddr = 0x0;
    address public contributorPoolAddr = 0x0;
    uint256 public contributorPoolMintQuota = 0;
    address[] public creatorsPoolAddrs;
    mapping(address => bool) isCreatorsPool;
    uint256 public creatorsPoolMintQuota = 0;
    mapping(address => uint256) public lockedBalances;
    uint public unlockTime = 0;
    SignatureChecker public signatureChecker = SignatureChecker(0x0);
    bool public signatureCheckerFreezed = false;
    address public signatureOwner = 0x0;
    bool public allowDelegate = true;
    mapping (address => mapping (uint256 => bool)) public usedNonce;
    mapping (address => bool) public transferAndCallWhitelist;

    event Lock(address indexed _addr, uint256 _value);
    event SignatureCheckerChanged(address _newSignatureChecker);

    function LikeCoin(uint256 _initialSupply, address _signatureOwner, address _sigCheckerAddr) public {
        supply = _initialSupply;
        balances[owner] = _initialSupply;
        signatureOwner = _signatureOwner;
        signatureChecker = SignatureChecker(_sigCheckerAddr);
        Transfer(0x0, owner, _initialSupply);
    }

    function totalSupply() public constant returns (uint256) {
        return supply;
    }

    function balanceOf(address _owner) public constant returns (uint256 balance) {
        return balances[_owner] + lockedBalances[_owner];
    }

    function _tryUnlockBalance(address _from) internal {
        if (unlockTime != 0 && now >= unlockTime && lockedBalances[_from] > 0) {
            balances[_from] = balances[_from].add(lockedBalances[_from]);
            delete lockedBalances[_from];
        }
    }

    function _transfer(address _from, address _to, uint256 _value) internal returns (bool success) {
        _tryUnlockBalance(_from);
        require(_from != 0x0);
        require(_to != 0x0);
        balances[_from] = balances[_from].sub(_value);
        balances[_to] = balances[_to].add(_value);
        Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) public returns (bool success) {
        return _transfer(msg.sender, _to, _value);
    }

    function transferAndLock(address _to, uint256 _value) public returns (bool success) {
        require(msg.sender != 0x0);
        require(_to != 0x0);
        require(now < unlockTime);
        require(msg.sender == crowdsaleAddr || msg.sender == owner || msg.sender == operator);
        balances[msg.sender] = balances[msg.sender].sub(_value);
        lockedBalances[_to] = lockedBalances[_to].add(_value);
        Transfer(msg.sender, _to, _value);
        Lock(_to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
        _transfer(_from, _to, _value);
        return true;
    }

    function _transferMultiple(address _from, address[] _addrs, uint256[] _values) internal returns (bool success) {
        require(_from != 0x0);
        require(_addrs.length > 0);
        require(_values.length == _addrs.length);
        _tryUnlockBalance(_from);
        uint256 total = 0;
        for (uint i = 0; i < _addrs.length; ++i) {
            address addr = _addrs[i];
            require(addr != 0x0);
            uint256 value = _values[i];
            balances[addr] = balances[addr].add(value);
            total = total.add(value);
            Transfer(_from, addr, value);
        }
        balances[_from] = balances[_from].sub(total);
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

    function setSignatureChecker(address _sigCheckerAddr) public {
        require(msg.sender == signatureOwner);
        require(!signatureCheckerFreezed);
        require(signatureChecker != _sigCheckerAddr);
        signatureChecker = SignatureChecker(_sigCheckerAddr);
        SignatureCheckerChanged(_sigCheckerAddr);
    }

    function freezeSignatureChecker() public {
        require(msg.sender == signatureOwner);
        require(!signatureCheckerFreezed);
        signatureCheckerFreezed = true;
    }

    modifier isDelegated(address _from, uint256 _maxReward, uint256 _claimedReward, uint256 _nonce) {
        require(allowDelegate);
        require(_from != 0x0);
        require(_claimedReward <= _maxReward);
        require(!usedNonce[_from][_nonce]);
        usedNonce[_from][_nonce] = true;
        require(_transfer(_from, msg.sender, _claimedReward));
        _;
    }

    function transferDelegated(
        address _from,
        address _to,
        uint256 _value,
        uint256 _maxReward,
        uint256 _claimedReward,
        uint256 _nonce,
        bytes _signature
    ) isDelegated(_from, _maxReward, _claimedReward, _nonce) public returns (bool success) {
        require(signatureChecker.checkTransferDelegated(_from, _to, _value, _maxReward, _nonce, _signature));
        return _transfer(_from, _to, _value);
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
    ) isDelegated(_from, _maxReward, _claimedReward, _nonce) public returns (bool success) {
        require(signatureChecker.checkTransferAndCallDelegated(_from, _to, _value, _data, _maxReward, _nonce, _signature));
        return _transferAndCall(_from, _to, _value, _data);
    }

    function transferMultipleDelegated(
        address _from,
        address[] _addrs,
        uint256[] _values,
        uint256 _maxReward,
        uint256 _claimedReward,
        uint256 _nonce,
        bytes _signature
    ) isDelegated(_from, _maxReward, _claimedReward, _nonce) public returns (bool success) {
        require(signatureChecker.checkTransferMultipleDelegated(_from, _addrs, _values, _maxReward, _nonce, _signature));
        return _transferMultiple(_from, _addrs, _values);
    }

    function switchDelegate(bool _allowed) ownerOrOperator public {
        require(allowDelegate != _allowed);
        allowDelegate = _allowed;
    }

    function addTransferAndCallWhitelist(address _contract) ownerOrOperator public {
        require(_isContract(_contract));
        require(!transferAndCallWhitelist[_contract]);
        transferAndCallWhitelist[_contract] = true;
    }

    function removeTransferAndCallWhitelist(address _contract) ownerOrOperator public {
        require(transferAndCallWhitelist[_contract]);
        delete transferAndCallWhitelist[_contract];
    }

    function approve(address _spender, uint256 _value) public returns (bool success) {
        require(_value == 0 || allowed[msg.sender][_spender] == 0);
        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) public constant returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    function burn(uint256 _value) public {
        balances[msg.sender] = balances[msg.sender].sub(_value);
        supply = supply.sub(_value);
        Transfer(msg.sender, 0x0, _value);
    }

    function registerCrowdsales(address _crowdsaleAddr, uint256 _value, uint256 _privateFundUnlockTime) onlyOwner public {
        require(crowdsaleAddr == 0x0);
        require(_crowdsaleAddr != 0x0);
        require(_isContract(_crowdsaleAddr));
        require(_privateFundUnlockTime > now);
        require(_value != 0);
        unlockTime = _privateFundUnlockTime;
        crowdsaleAddr = _crowdsaleAddr;
        supply = supply.add(_value);
        balances[_crowdsaleAddr] = balances[_crowdsaleAddr].add(_value);
        Transfer(0x0, crowdsaleAddr, _value);
    }

    function registerContributorPool(address _contributorPoolAddr, uint256 _mintLimit) onlyOwner public {
        require(contributorPoolAddr == 0x0);
        require(_contributorPoolAddr != 0x0);
        require(_isContract(_contributorPoolAddr));
        require(_mintLimit != 0);
        contributorPoolAddr = _contributorPoolAddr;
        contributorPoolMintQuota = _mintLimit;
    }

    function mintForContributorPool(uint256 _value) public {
        require(msg.sender == contributorPoolAddr);
        require(_value != 0);
        contributorPoolMintQuota = contributorPoolMintQuota.sub(_value);
        supply = supply.add(_value);
        balances[msg.sender] = balances[msg.sender].add(_value);
        Transfer(0x0, msg.sender, _value);
    }

    function registerCreatorsPools(address[] _poolAddrs, uint256 _mintLimit) onlyOwner public {
        require(creatorsPoolAddrs.length == 0);
        require(_poolAddrs.length > 0);
        require(_mintLimit > 0);
        for (uint i = 0; i < _poolAddrs.length; ++i) {
            require(_isContract(_poolAddrs[i]));
            creatorsPoolAddrs.push(_poolAddrs[i]);
            isCreatorsPool[_poolAddrs[i]] = true;
        }
        creatorsPoolMintQuota = _mintLimit;
    }

    function mintForCreatorsPool(uint256 _value) public {
        require(isCreatorsPool[msg.sender]);
        require(_value != 0);
        creatorsPoolMintQuota = creatorsPoolMintQuota.sub(_value);
        supply = supply.add(_value);
        balances[msg.sender] = balances[msg.sender].add(_value);
        Transfer(0x0, msg.sender, _value);
    }
}
