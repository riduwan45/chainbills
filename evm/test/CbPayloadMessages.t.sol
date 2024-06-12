// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test, console} from 'forge-std/Test.sol';
import {CbStructs} from '../src/CbStructs.sol';
import {CbPayloadMessages} from '../src/CbPayloadMessages.sol';
import 'wormhole/Utils.sol';

contract CbPayloadMessagesTest is Test {
  CbPayloadMessages public cbpm;

  function setUp() public {
    cbpm = new CbPayloadMessages();
  }

  function test_EncodingDecoding() public view {
    bytes memory encoded = cbpm.encodePayloadMessage(
      CbStructs.CbPayloadMessage({
        actionId: 1,
        caller: toWormholeFormat(msg.sender),
        payableId: toWormholeFormat(address(0)),
        token: toWormholeFormat(address(0)),
        amount: 0,
        allowsFreePayments: true,
        tokensAndAmounts: new CbStructs.CbTokenAndAmount[](0),
        description: 'Ethereum Consultation'
      })
    );
    console.logBytes(encoded);
    CbStructs.CbPayloadMessage memory decoded = cbpm.decodePayloadMessage(
      encoded
    );
    console.logString(decoded.description);
    assert(decoded.actionId == 1);
    assert(decoded.caller == toWormholeFormat(msg.sender));
    assert(decoded.payableId == toWormholeFormat(address(0)));
  }
}
