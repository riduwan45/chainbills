use crate::{error::ChainbillsError, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct Withdraw<'info> {
  #[account(
        init,
        seeds = [signer.key().as_ref(),
            Withdrawal::SEED_PREFIX,
            &host.next_withdrawal().to_le_bytes()[..]],
        bump,
        payer = signer,
        space = Withdrawal::SPACE
    )]
  pub withdrawal: Box<Account<'info, Withdrawal>>,

  #[account(
        init,
        seeds = [payable.key().as_ref(),
            PayableWithdrawalInfo::SEED_PREFIX,
            &payable.next_withdrawal().to_le_bytes()[..]],
        bump,
        payer = signer,
        space = PayableWithdrawalInfo::SPACE
    )]
  pub payable_withdrawal_info: Box<Account<'info, PayableWithdrawalInfo>>,

  #[account(mut, constraint = payable.host == *signer.key @ ChainbillsError::NotYourPayable)]
  pub payable: Box<Account<'info, Payable>>,

  #[account(mut, seeds = [signer.key().as_ref()], bump)]
  pub host: Box<Account<'info, User>>,

  #[account(mut, seeds = [ChainStats::SEED_PREFIX], bump)]
  pub chain_stats: Box<Account<'info, ChainStats>>,

  #[account(seeds = [Config::SEED_PREFIX], bump)]
  pub config: AccountLoader<'info, Config>,

  pub mint: Box<Account<'info, Mint>>,

  #[account(seeds = [TokenDetails::SEED_PREFIX, mint.key().as_ref()], bump)]
  pub token_details: Box<Account<'info, TokenDetails>>,

  #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
  pub host_token_account: Box<Account<'info, TokenAccount>>,

  #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = chain_stats,
    )]
  pub chain_token_account: Box<Account<'info, TokenAccount>>,

  #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = fee_collector,
    )]
  pub fees_token_account: Box<Account<'info, TokenAccount>>,

  #[account(address = config.load()?.chainbills_fee_collector)]
  pub fee_collector: SystemAccount<'info>,

  #[account(mut)]
  pub signer: Signer<'info>,

  pub token_program: Program<'info, Token>,

  pub system_program: Program<'info, System>,
}
