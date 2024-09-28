use crate::contract::Chainbills;
use crate::error::ChainbillsError;
use crate::messages::{FetchIdMessage, IdMessage, TransactionInfoMessage};
use crate::state::{PayablePayment, TokenAndAmount, User, UserPayment};
use cosmwasm_std::{to_json_binary, WasmMsg};
use cw20::Cw20ExecuteMsg;
use sylvia::cw_std::{Event, HexBinary, Response, StdError};
use sylvia::interface;
use sylvia::types::{ExecCtx, QueryCtx};

#[interface]
pub trait Payments {
  type Error: From<StdError>;

  #[sv::msg(query)]
  fn user_payment_id(
    &self,
    ctx: QueryCtx,
    msg: FetchIdMessage,
  ) -> Result<IdMessage, Self::Error>;

  #[sv::msg(query)]
  fn user_payment(
    &self,
    ctx: QueryCtx,
    msg: IdMessage,
  ) -> Result<UserPayment, Self::Error>;

  #[sv::msg(query)]
  fn payable_payment_id(
    &self,
    ctx: QueryCtx,
    msg: FetchIdMessage,
  ) -> Result<IdMessage, Self::Error>;

  #[sv::msg(query)]
  fn payable_payment(
    &self,
    ctx: QueryCtx,
    msg: IdMessage,
  ) -> Result<PayablePayment, Self::Error>;

  #[sv::msg(exec)]
  fn pay(
    &self,
    ctx: ExecCtx,
    data: TransactionInfoMessage,
  ) -> Result<Response, Self::Error>;
}

impl Payments for Chainbills {
  type Error = ChainbillsError;

  fn user_payment_id(
    &self,
    ctx: QueryCtx,
    msg: FetchIdMessage,
  ) -> Result<IdMessage, Self::Error> {
    // Validate the wallet address.
    let valid_wallet = ctx.deps.api.addr_validate(&msg.reference)?;

    // Ensure the requested count is valid.
    let user = self
      .users
      .load(ctx.deps.storage, &valid_wallet)
      .unwrap_or(User::initialize(0));
    if msg.count > user.payments_count {
      return Err(ChainbillsError::InvalidUserPaymentCount {});
    }

    // Get and return the Payment ID.
    let payment_ids = self
      .user_payment_ids
      .load(ctx.deps.storage, &valid_wallet)?;
    let id = HexBinary::from(payment_ids[(msg.count - 1) as usize]).to_hex();
    Ok(IdMessage { id })
  }

  fn user_payment(
    &self,
    ctx: QueryCtx,
    msg: IdMessage,
  ) -> Result<UserPayment, Self::Error> {
    match self.user_payments.may_load(
      ctx.deps.storage,
      <[u8; 32]>::try_from(HexBinary::from_hex(&msg.id)?.as_slice()).unwrap(),
    )? {
      Some(payment) => Ok(payment),
      None => Err(ChainbillsError::InvalidPaymentId {}),
    }
  }

  fn payable_payment_id(
    &self,
    ctx: QueryCtx,
    msg: FetchIdMessage,
  ) -> Result<IdMessage, Self::Error> {
    // Ensure that the payable_id is valid.
    let valid_pybl_id =
      <[u8; 32]>::try_from(HexBinary::from_hex(&msg.reference)?.as_slice())
        .unwrap();
    if !self.payables.has(ctx.deps.storage, valid_pybl_id) {
      return Err(ChainbillsError::InvalidPayableId {});
    }
    let payable = self.payables.load(ctx.deps.storage, valid_pybl_id)?;

    // Ensure the requested count is valid.
    if msg.count > payable.payments_count {
      return Err(ChainbillsError::InvalidPayablePaymentCount {});
    }

    // Get and return the Payment ID.
    let payment_ids = self
      .payable_payment_ids
      .load(ctx.deps.storage, valid_pybl_id)?;
    let id = HexBinary::from(payment_ids[(msg.count - 1) as usize]).to_hex();
    Ok(IdMessage { id })
  }

  fn payable_payment(
    &self,
    ctx: QueryCtx,
    msg: IdMessage,
  ) -> Result<PayablePayment, Self::Error> {
    match self.payable_payments.may_load(
      ctx.deps.storage,
      <[u8; 32]>::try_from(HexBinary::from_hex(&msg.id)?.as_slice()).unwrap(),
    )? {
      Some(payment) => Ok(payment),
      None => Err(ChainbillsError::InvalidPaymentId {}),
    }
  }

  fn pay(
    &self,
    ctx: ExecCtx,
    msg: TransactionInfoMessage,
  ) -> Result<Response, Self::Error> {
    /* CHECKS */
    // Ensure that the payable_id is valid.
    let payable_id =
      <[u8; 32]>::try_from(HexBinary::from_hex(&msg.payable_id)?.as_slice())
        .unwrap();
    if !self.payables.has(ctx.deps.storage, payable_id) {
      return Err(ChainbillsError::InvalidPayableId {});
    }
    let mut payable = self.payables.load(ctx.deps.storage, payable_id)?;

    // Ensure that the payable is not closed.
    if payable.is_closed {
      return Err(ChainbillsError::PayableIsClosed {});
    }

    // Ensure that amount is greater than zero.
    if msg.amount.is_zero() {
      return Err(ChainbillsError::ZeroAmountSpecified {});
    }

    // Ensure that the token is valid and is supported. Basically if a token's
    // max fees is not set, then it isn't supported.
    let token = &ctx.deps.api.addr_validate(&msg.token)?;
    if !self.max_fees_per_token.has(ctx.deps.storage, token) {
      return Err(ChainbillsError::InvalidToken {});
    }

    let amount = msg.amount;

    // Ensure that the specified token to be transferred is an allowed token
    // for this payable, if this payable specified the tokens and amounts it
    // can accept.
    if !payable.allowed_tokens_and_amounts.is_empty() {
      let mut ataa_it = payable.allowed_tokens_and_amounts.iter().peekable();
      while let Some(taa) = ataa_it.next() {
        if taa.token == token && taa.amount == amount {
          break;
        }
        if ataa_it.peek().is_none() {
          return Err(ChainbillsError::MatchingTokenAndAmountNotFound {});
        }
      }
    }

    /* TRANSFER */
    let mut cw20_messages = vec![];
    if token == ctx.env.contract.address {
      // Verify Native Token Payment was made.
      let verified_amount = cw_utils::must_pay(
        &ctx.info,
        &self.config.load(ctx.deps.storage)?.native_denom,
      )?;
      if verified_amount != amount {
        return Err(ChainbillsError::InvalidNativeTokenPayment {});
      }
    } else {
      // Prepare the message for the CW20 Token Transfer to add to the response.
      cw20_messages.push(WasmMsg::Execute {
        contract_addr: token.to_string(),
        funds: vec![],
        msg: to_json_binary(&Cw20ExecuteMsg::TransferFrom {
          owner: ctx.info.sender.to_string(),
          recipient: ctx.env.contract.address.to_string(),
          amount,
        })?,
      });
    }

    /* STATE CHANGES */
    // Increment the chain stats for payments_count.
    let mut chain_stats = self.chain_stats.load(ctx.deps.storage)?;
    chain_stats.payments_count = chain_stats.next_payment();
    self.chain_stats.save(ctx.deps.storage, &chain_stats)?;

    // Increment paymentsCount on the payer (address) making this payable.
    let mut events =
      self.initialize_user_if_need_be(ctx.deps.storage, &ctx.info.sender)?;
    let mut user = self.users.load(ctx.deps.storage, &ctx.info.sender)?;
    user.payments_count = user.next_payment();
    self.users.save(ctx.deps.storage, &ctx.info.sender, &user)?;

    // Increment global paymentsCount on the payable.
    payable.payments_count = payable.next_payment();

    // Update payable's balances to add this token and its amount.
    //
    // This boolean and the following two scopes was used (instead of peekable)
    // to solve the borrowing twice bug with rust on the payable variable.
    let mut was_matching_balance_updated = false;
    {
      for balance in payable.balances.iter_mut() {
        if balance.token == token {
          balance.amount = balance.amount.checked_add(amount).unwrap();
          was_matching_balance_updated = true;
          break;
        }
      }
    }
    {
      if !was_matching_balance_updated {
        payable.balances.push(TokenAndAmount {
          token: token.clone(),
          amount,
        });
      }
    }

    // Save the Updated Payable.
    self.payables.save(ctx.deps.storage, payable_id, &payable)?;

    // Increment the local-chain paymentsCount for the payable.
    let mut local_chain_count = self
      .payable_chain_payments_count
      .may_load(
        ctx.deps.storage,
        (payable_id.to_vec(), chain_stats.chain_id),
      )?
      .unwrap_or_default();
    local_chain_count = local_chain_count.checked_add(1).unwrap();
    self.payable_chain_payments_count.save(
      ctx.deps.storage,
      (payable_id.to_vec(), chain_stats.chain_id),
      &local_chain_count,
    )?;

    // Get a new Payment ID
    let payment_id = self.create_id(
      ctx.deps.storage,
      &ctx.env,
      &ctx.info.sender,
      user.payments_count,
    )?;

    // Save the Payment ID to the users_payment_ids.
    let mut user_payment_ids = self
      .user_payment_ids
      .may_load(ctx.deps.storage, &ctx.info.sender)?
      .unwrap_or_default();
    user_payment_ids.push(payment_id);
    self.user_payment_ids.save(
      ctx.deps.storage,
      &ctx.info.sender,
      &user_payment_ids,
    )?;

    // Create and Save the UserPayment.
    let user_payment = UserPayment {
      payable_id,
      payer: ctx.info.sender.clone(),
      payable_chain_id: chain_stats.chain_id,
      chain_count: chain_stats.payments_count,
      payer_count: user.payments_count,
      payable_count: payable.payments_count,
      timestamp: ctx.env.block.time.seconds(),
      details: TokenAndAmount {
        token: token.clone(),
        amount,
      },
    };
    self
      .user_payments
      .save(ctx.deps.storage, payment_id, &user_payment)?;

    // Save the Payment ID to the payables_payment_ids.
    let mut payable_payment_ids = self
      .payable_payment_ids
      .may_load(ctx.deps.storage, payable_id)?
      .unwrap_or_default();
    payable_payment_ids.push(payment_id);
    self.payable_payment_ids.save(
      ctx.deps.storage,
      payable_id,
      &payable_payment_ids,
    )?;

    // Create and Save the PayablePayment.
    let payable_payment = PayablePayment {
      payable_id,
      payer: self.address_to_bytes32(&ctx.info.sender, ctx.deps.api),
      payer_chain_id: chain_stats.chain_id,
      local_chain_count,
      payable_count: payable.payments_count,
      payer_count: user.payments_count,
      timestamp: ctx.env.block.time.seconds(),
      details: TokenAndAmount {
        token: token.clone(),
        amount,
      },
    };
    self.payable_payments.save(
      ctx.deps.storage,
      payment_id,
      &payable_payment,
    )?;

    // Emit events and return a response.
    let attributes = vec![
      ("payable_id", HexBinary::from(&payable_id).to_hex()),
      ("payer_wallet", ctx.info.sender.to_string()),
      ("payment_id", HexBinary::from(&payment_id).to_hex()),
      ("chain_count", chain_stats.payments_count.to_string()),
    ];
    let user_pymt_attribs = vec![
      ("payable_chain_id", chain_stats.chain_id.to_string()),
      ("payer_count", user.payments_count.to_string()),
    ];
    let pybl_pymt_attribs = vec![
      ("payer_chain_id", chain_stats.chain_id.to_string()),
      ("payable_count", payable.payments_count.to_string()),
    ];
    events.push(
      Event::new("user_paid")
        .add_attributes(attributes.clone())
        .add_attributes(user_pymt_attribs),
    );
    events.push(
      Event::new("payable_paid")
        .add_attributes(attributes.clone())
        .add_attributes(pybl_pymt_attribs),
    );
    let res = Response::new()
      .add_messages(cw20_messages) // Add the cw20 messages
      .add_events(events)
      .add_attribute("action", "pay")
      .add_attributes(attributes.clone());
    Ok(res)
  }
}
