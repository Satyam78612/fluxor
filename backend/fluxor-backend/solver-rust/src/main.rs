use tokio::signal;
mod config;
mod worker;
mod db;
mod aggregator;
mod types;
mod route_builder;
mod scoring;
mod prices;
mod token_registry;
mod fee;
mod routing;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    let cfg = config::Config::load()?;

    // start worker loop (subscribe NATS, or simple polling depending on choice)
    worker::run(cfg).await?;

    // wait for ctrl-c
    signal::ctrl_c().await?;
    Ok(())
}
