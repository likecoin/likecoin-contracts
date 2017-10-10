pragma solidity ^0.4.15;

import "./LikeCoin.sol";

// This contract controls the crowdsales of Like Coin.

contract LikeCrowdsale {
    address owner;
    address public likeCoinAddr;
    uint public startTime;
    uint public endTime;
    uint256 public amount;
    uint256 public unitPriceWei;
    uint256 public remainingToken;

    function LikeCrowdsale() {
        owner = msg.sender;
    }

    function initCrowdsale(uint _start, uint _end, uint256 _amount, uint256 _unitPriceWei) {
        // TODO:
        //  - check owner
        //  - ensure crowdsale ended
        //  - mint coins (owned by this contract)
    }

    function buy() payable {
        // TODO:
        //  - ensure crowdsale started
        //  - check amount of ETH
        //  - check remaining token
        //  - transfer tokens
    }
}
