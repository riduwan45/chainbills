use crate::{context::*, error::ChainbillsError, events::*, state::*};
use anchor_lang::{prelude::*, solana_program::clock};

/// Create a Payable
///
/// ### args
/// * allowed_tokens_and_amounts<Vec<TokenAndAmount>>: The allowed tokens
///         (and their amounts) on this payable. If this vector is empty,
///         then the payable will accept payments in any token.
#[inline(never)]
pub fn create_payable_handler<'info>(
  ctx: Context<'_, '_, 'info, 'info, CreatePayable>,
  allowed_tokens_and_amounts: Vec<TokenAndAmount>,
) -> Result<()> {
  /* CHECKS */
  // Ensure that length of remaining_accounts in context matches that of the
  // allowed_tokens_and_amounts (ataas) vector. This is necessary inorder to
  // use remaining_accounts to get the token details.
  require!(
    ctx.remaining_accounts.len() == allowed_tokens_and_amounts.len(),
    ChainbillsError::InvalidRemainingAccountsLength
  );

  for (i, taa) in allowed_tokens_and_amounts.iter().enumerate() {
    // Get the token details for the specified token.
    let token_details =
      Account::<'info, TokenDetails>::try_from(&ctx.remaining_accounts[i])
        .map_err(|_| ChainbillsError::NonTokenDetailsAccountProvided)?;

    // Ensure that the token is supported.
    require!(
      taa.token == token_details.mint,
      ChainbillsError::InvalidTokenDetailsAccount
    );
    require!(
      token_details.is_supported,
      ChainbillsError::UnsupportedToken
    );

    // Ensure that all specified acceptable amounts are greater than zero.
    require!(taa.amount > 0, ChainbillsError::ZeroAmountSpecified);
  }

  /* STATE CHANGES */
  // Increment the chain stats for payables_count and activities_count.
  let chain_stats = ctx.accounts.chain_stats.as_mut();
  chain_stats.payables_count = chain_stats.next_payable();
  chain_stats.activities_count = chain_stats.next_activity();

  // Increment payables_count and activities_count on the host initializing
  // this payable.
  let host = ctx.accounts.host.as_mut();
  host.payables_count = host.next_payable();
  host.activities_count = host.next_activity();

  let timestamp = clock::Clock::get()?.unix_timestamp as u64;

  // Initialize the payable.
  let payable = ctx.accounts.payable.as_mut();
  payable.chain_count = chain_stats.payables_count;
  payable.host = ctx.accounts.signer.key();
  payable.host_count = host.payables_count;
  payable.allowed_tokens_and_amounts = allowed_tokens_and_amounts;
  payable.balances = Vec::<TokenAndAmount>::new();
  payable.created_at = timestamp;
  payable.payments_count = 0;
  payable.withdrawals_count = 0;
  payable.activities_count = 1; // Start at 1 to record the initialization.
  payable.is_closed = false;

  // Initialize the payable_per_chain_payments_counter for Solana.
  let ppcpc = ctx.accounts.payable_per_chain_payments_counter.as_mut();
  ppcpc.payments_count = 0;

  // Initialize the activity.
  let activity = ctx.accounts.activity.as_mut();
  activity.chain_count = chain_stats.activities_count;
  activity.user_count = host.activities_count;
  activity.payable_count = payable.activities_count;
  activity.timestamp = timestamp;
  activity.reference = payable.key();
  activity.activity_type = ActivityType::CreatedPayable;

  // Initialize the user activity info.
  let user_activity_info = ctx.accounts.user_activity_info.as_mut();
  user_activity_info.chain_count = chain_stats.activities_count;

  // Initialize the payable activity info.
  let payable_activity_info = ctx.accounts.payable_activity_info.as_mut();
  payable_activity_info.chain_count = chain_stats.activities_count;

  // Emit log and event.
  msg!(
    "Initialized Payable with chain_count: {} and host_count: {}.",
    payable.chain_count,
    payable.host_count
  );
  emit!(CreatedPayable {
    payable_id: payable.key(),
    host_wallet: ctx.accounts.signer.key(),
    chain_count: payable.chain_count,
    host_count: payable.host_count,
  });
  Ok(())
}
