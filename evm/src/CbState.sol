// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

error InvalidChainId();
error InvalidPageNumber();
error InvalidPayableId();
error InvalidPaymentId();
error InvalidWithdrawalId();

/// Config account data. Mainly Governance.
struct Config {
  /// The number of block confirmations needed before the wormhole network
  /// will attest a message.
  uint8 wormholeFinality;
  /// Wormhole Chain ID of this chain.
  uint16 chainId;
  /// The withdrawal fee percentage with 2 decimals. 200 means 2%.
  uint16 withdrawalFeePercentage;
  /// The address that receives withdrawal fees.
  address feeCollector;
  /// The address of the Wormhole Core Contract on this chain.
  address wormhole;
}

/// Keeps track of all activities on this chain. Counters for the
/// users, payables, userPayments, and withdrawals mappings.
struct ChainStats {
  /// Total number of users that have ever interacted on this chain.
  uint256 usersCount;
  /// Total number of payables that have ever been created on this chain.
  uint256 payablesCount;
  /// Total number of payments that users have ever been made on this chain.
  uint256 userPaymentsCount;
  /// Total number of payments that payables have ever received on this chain.
  uint256 payablePaymentsCount;
  /// Total number of withdrawals that have ever been made on this chain.
  uint256 withdrawalsCount;
  /// Total number of activities that have ever been made on this chain.
  uint256 activitiesCount;
}

/// A user is an entity that can create payables and make payments.
struct User {
  /// The nth count of users on this chain at the point this user was
  /// initialized.
  uint256 chainCount;
  /// Total number of payables that this user has ever created.
  uint256 payablesCount;
  /// Total number of payments that this user has ever made.
  uint256 paymentsCount;
  /// Total number of withdrawals that this user has ever made.
  uint256 withdrawalsCount;
  /// Total number of activities that this user has ever made.
  uint256 activitiesCount;
}

/// Keeps track of details about tokens ever supported on this chain.
struct TokenDetails {
  /// Tells whether payments are currently accepted in this token.
  bool isSupported;
  /// The maximum fees for withdrawal (with its decimals).
  uint256 maxWithdrawalFees;
  /// The total amount of user payments in this token.
  uint256 totalUserPaid;
  /// The total amount of payable payments in this token.
  uint256 totalPayableReceived;
  /// The total amount of withdrawals in this token.
  uint256 totalWithdrawn;
  /// The total amount of fees collected from withdrawals in this token.
  uint256 totalWithdrawalFeesCollected;
}

/// A combination of a token address and its associated amount.
///
/// This combination is used to constrain how much of a token
/// a payable can accept. It is also used to record the details
/// of a payment or a withdrawal.
struct TokenAndAmount {
  /// The address of the associated token.
  address token;
  /// The amount of the token.
  uint256 amount;
}

/// A payable is like a public invoice through which anybody can pay to.
struct Payable {
  /// The address of the User account that owns this Payable.
  address host;
  /// The nth count of payables on this chain at the point this payable
  /// was created.
  uint256 chainCount;
  /// The nth count of payables that the host has created at the point of
  /// this payable's creation.
  uint256 hostCount;
  /// The timestamp of when this payable was created.
  uint256 createdAt;
  /// The total number of payments made to this payable, from all chains.
  uint256 paymentsCount;
  /// The total number of withdrawals made from this payable.
  uint256 withdrawalsCount;
  /// The total number of activities made on this payable.
  uint256 activitiesCount;
  /// The number of the allowedTokensAndAmounts of this Payable.
  uint8 allowedTokensAndAmountsCount;
  /// The length of the balances array in this Payable.
  uint8 balancesCount;
  /// Whether this payable is currently accepting payments.
  bool isClosed;
}

/// Receipt of a payment from any blockchain network (this-chain inclusive)
/// made to a Payable in this chain.
struct PayablePayment {
  /// The ID of the Payable to which this Payment was made.
  bytes32 payableId;
  /// The Wormhole-normalized wallet address that made this Payment.
  /// If the payer is on this chain, this will be their address with
  /// front-padded zeros.
  bytes32 payer;
  /// The nth count of payable payments on this chain at the point this payment
  /// was received.
  uint256 chainCount;
  /// The Wormhole Chain ID of the chain from which the payment was made.
  uint16 payerChainId;
  /// The nth count of payments to this payable from the payment source
  /// chain at the point this payment was recorded.
  uint256 localChainCount;
  /// The nth count of payments that the payable has received
  /// at the point when this payment was made.
  uint256 payableCount;
  /// When this payment was made.
  uint256 timestamp;
}

/// A user's receipt of a payment made in this chain to a Payable on any
/// blockchain network (this-chain inclusive).
struct UserPayment {
  /// The ID of the Payable to which this Payment was made.
  bytes32 payableId;
  /// The address of the User account that made this Payment.
  address payer;
  /// The Wormhole Chain ID of the chain into which the payment was made.
  uint16 payableChainId;
  /// The nth count of payments on this chain at the point this payment
  /// was made.
  uint256 chainCount;
  /// The nth count of payments that the payer has made
  /// at the point of making this payment.
  uint256 payerCount;
  /// When this payment was made.
  uint256 timestamp;
}

/// A receipt of a withdrawal made by a Host from a Payable.
struct Withdrawal {
  /// The ID of the Payable from which this Withdrawal was made.
  bytes32 payableId;
  /// The address of the User account (payable's owner)
  /// that made this Withdrawal.
  address host;
  /// The nth count of withdrawals on this chain at the point
  /// this withdrawal was made.
  uint256 chainCount;
  /// The nth count of withdrawals that the host has made
  /// at the point of making this withdrawal.
  uint256 hostCount;
  /// The nth count of withdrawals that has been made from
  /// this payable at the point when this withdrawal was made.
  uint256 payableCount;
  /// When this withdrawal was made.
  uint256 timestamp;
}

/// A record of an activity.
enum ActivityType {
  /// A user was initialized.
  InitializedUser,
  /// A payable was created.
  CreatedPayable,
  /// A payment was made by a user.
  UserPaid,
  /// A payment was made to the payable.
  PayableReceived,
  /// A withdrawal was made by a payable.
  Withdrew,
  /// The payable was closed and is no longer accepting payments.
  ClosedPayable,
  /// The payable was reopened and is now accepting payments.
  ReopenedPayable,
  /// The payable's allowed tokens and amounts were updated.
  UpdatedPayableAllowedTokensAndAmounts
}

/// A record of an activity.
struct ActivityRecord {
  /// The nth count of activities on this chain at the point this activity
  /// was recorded.
  uint256 chainCount;
  /// The nth count of activities that the user has made at the point
  /// of this activity.
  uint256 userCount;
  /// The nth count of activities on the related payable at the point
  /// of this activity.
  uint256 payableCount;
  /// The timestamp of when this activity was recorded.
  uint256 timestamp;
  /// The ID of the entity (Payable, Payment, or Withdrawal) that is relevant
  /// to this activity.
  bytes32 entity;
  /// The type of activity.
  ActivityType activityType;
}

/// The type of entity that an ID is associated with. Used as a salt in
/// generating unique IDs for Payables, Payments, Withdrawals, and Activities.
///
/// @dev Using this enum instead of a strings to save gas.
enum EntityType {
  Payable,
  Payment,
  Withdrawal,
  Activity
}

contract CbState {
  /// Configuration of this chain.
  Config public config;
  /// Counter for activities on this chain.
  ChainStats public chainStats;
  /// Array of IDs of Activities on this chain.
  bytes32[] public chainActivityIds;
  /// Array of Wallet Addresses of Users on this chain.
  address[] public userAddresses;
  /// Wormhole Chain IDs against their corresponding Emitter
  /// Contract Addresses on those chains, that is, trusted caller contracts.
  mapping(uint16 => bytes32) public registeredEmitters;
  /// Details of Supported Tokens on this chain.
  mapping(address => TokenDetails) public tokenDetails;
  /// Activities on this chain.
  mapping(bytes32 => ActivityRecord) public activities;
  /// User accounts on this chain.
  mapping(address => User) public users;
  /// Array of IDs of Payable created by users.
  mapping(address => bytes32[]) public userPayableIds;
  /// Array of IDs of Payment made by users.
  mapping(address => bytes32[]) public userPaymentIds;
  /// Payments on this chain by their IDs by users.
  mapping(bytes32 => UserPayment) public userPayments;
  /// The amount and token that the payers paid
  mapping(bytes32 => TokenAndAmount) public userPaymentDetails;
  /// Array of IDs of Activities made by users.
  mapping(address => bytes32[]) public userActivityIds;
  /// Payables on this chain by their IDs
  mapping(bytes32 => Payable) public payables;
  /// The allowed tokens (and their amounts) on payables.
  mapping(bytes32 => TokenAndAmount[]) public payableAllowedTokensAndAmounts;
  /// Records of how much is in payables.
  mapping(bytes32 => TokenAndAmount[]) public payableBalances;
  /// Payments to Payables, from all chains, by their IDs. The Payment IDs
  /// will be the same as the IDs of userPayments if the payment was made
  /// by a User on this chain. Otherwise, the payment ID will be different.
  mapping(bytes32 => PayablePayment) public payablePayments;
  /// The amount and token that payers paid to Payables
  mapping(bytes32 => TokenAndAmount) public payablePaymentDetails;
  /// IDs of Payments to Payables, from all chains.
  mapping(bytes32 => bytes32[]) public payablePaymentIds;
  /// Total Number of payments made to this payable, from each chain by
  /// their Wormhole Chain IDs.
  mapping(bytes32 => mapping(uint16 => uint256)) public
    payableChainPaymentsCount;
  /// Payment IDs of payments made to this payable, from each chain by
  /// their Wormhole Chain IDs.
  mapping(bytes32 => mapping(uint16 => bytes32[])) public payableChainPaymentIds;
  /// Array of IDs of Activities of payables.
  mapping(bytes32 => bytes32[]) public payableActivityIds;
  /// Withdrawals on this chain by their IDs
  mapping(bytes32 => Withdrawal) public withdrawals;
  /// Array of IDs of Withdrawals made by users.
  mapping(address => bytes32[]) public userWithdrawalIds;
  /// Array of IDs of Withdrawals made in a payable.
  mapping(bytes32 => bytes32[]) public payableWithdrawalIds;
  /// The amount and token that a host withdrew
  mapping(bytes32 => TokenAndAmount) public withdrawalDetails;
  /// storage gap for additional state variables in future versions
  uint256[50] __gap;

  function getAllowedTokensAndAmounts(bytes32 payableId)
    external
    view
    returns (TokenAndAmount[] memory)
  {
    if (payableId == bytes32(0)) revert InvalidPayableId();
    if (payables[payableId].host == address(0)) revert InvalidPayableId();
    return payableAllowedTokensAndAmounts[payableId];
  }

  function getBalances(bytes32 payableId)
    external
    view
    returns (TokenAndAmount[] memory)
  {
    if (payableId == bytes32(0)) revert InvalidPayableId();
    if (payables[payableId].host == address(0)) revert InvalidPayableId();
    return payableBalances[payableId];
  }

  function getUserPaymentDetails(bytes32 paymentId)
    external
    view
    returns (TokenAndAmount memory)
  {
    if (paymentId == bytes32(0)) revert InvalidPaymentId();
    if (userPayments[paymentId].payer == address(0)) revert InvalidPaymentId();
    return userPaymentDetails[paymentId];
  }

  function getPayablePaymentDetails(bytes32 paymentId)
    external
    view
    returns (TokenAndAmount memory)
  {
    if (paymentId == bytes32(0)) revert InvalidPaymentId();
    if (payablePayments[paymentId].payableId == bytes32(0)) {
      revert InvalidPaymentId();
    }
    return payablePaymentDetails[paymentId];
  }

  function getWithdrawalDetails(bytes32 withdrawalId)
    external
    view
    returns (TokenAndAmount memory)
  {
    if (withdrawalId == bytes32(0)) revert InvalidWithdrawalId();
    if (withdrawals[withdrawalId].host == address(0)) {
      revert InvalidWithdrawalId();
    }
    return withdrawalDetails[withdrawalId];
  }

  function getPayableChainPaymentsCount(bytes32 payableId, uint16 chainId_)
    external
    view
    returns (uint256)
  {
    if (payableId == bytes32(0)) revert InvalidPayableId();
    if (payables[payableId].host == address(0)) revert InvalidPayableId();
    return payableChainPaymentsCount[payableId][chainId_];
  }

  function getPayableChainPaymentIds(bytes32 payableId, uint16 chainId_)
    external
    view
    returns (bytes32[] memory)
  {
    if (payableId == bytes32(0)) revert InvalidPayableId();
    if (payables[payableId].host == address(0)) revert InvalidPayableId();
    return payableChainPaymentIds[payableId][chainId_];
  }
}
