use anchor_lang::error_code;

#[error_code]
pub enum EscrowError {
  #[msg("Account state has not been initialized yet")]
  AccountNotInitialized,
  #[msg("Receiver has not yet confirmed their side of the escrow")]
  ReceiverNotYetConfirmed,
  #[msg("Receiver has already confirmed their side of the process")]
  ReceiverAlreadyConfirmed,
  #[msg("Awaiting payer confirmation")]
  AwaitingPayerConfirmation,
}