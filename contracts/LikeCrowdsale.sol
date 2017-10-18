pragma solidity ^0.4.15;

import "./LikeCoin.sol";

contract LikeCrowdsale {
    address public owner;
    LikeCoin public like;
    uint public start;
    uint public end;
    uint256 public coinsPerEth;
    uint256 public softCap;
    uint256 public hardCap;
    bool public success = false;
    bool public privateFundFinalized = false;
    uint256 public remainingCoinUnits;
    mapping (address => bool) public kycDone;

    function LikeCrowdsale(address _likeAddr, uint _start, uint _end, uint256 _coinsPerEth, uint256 _softCap, uint256 _hardCap) {
        owner = msg.sender;
        like = LikeCoin(_likeAddr);
        start = _start;
        end = _end;
        coinsPerEth = _coinsPerEth;
        softCap = _softCap;
        hardCap = _hardCap;
        remainingCoinUnits = hardCap;
    }

    function addPrivateFund(address _addr, uint256 _value) {
        // TODO
    }

    function finalizePrivateFund() {
        // TODO
    }

    function registerKYC(address _customerAddr) {
        // TODO
    }

    function () payable {
        // TODO
    }

    function getCoinOrRefund() {
        // TODO
    }

    function finalize() {
        // TODO
    }
}
