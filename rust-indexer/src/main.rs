use alloy::providers::{Provider, ProviderBuilder};
use dotenv::dotenv;
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use url::Url;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Load .env
    dotenv().ok();

    // 2. Load ETH_RPC_URL or panic
    let rpc_url_str = env::var("ETH_RPC_URL").expect("Please set ETH_RPC_URL in .env");
    
    println!("Kakuzu Observer initializing...");
    println!("Target RPC: {}", rpc_url_str);

    // Validate URL parse
    let rpc_url: Url = rpc_url_str.parse().expect("Invalid RPC URL format");

    // 3. Setup basic provider (Stub)
    // In the future, this will be a WsConnect for subscriptions.
    let _provider = ProviderBuilder::new().on_http(rpc_url);

    println!("Provider initialized. Starting subscription loop stub...");

    // 4. Subscription Loop Stub
    loop {
        println!("Scanning for events... (Stub)");
        sleep(Duration::from_secs(5)).await;
    }
}
