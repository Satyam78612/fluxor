FROM rust:1.70 as builder
WORKDIR /usr/src/fluxor-solver
COPY . .
RUN cargo build --release

FROM debian:buster-slim
COPY --from=builder /usr/src/fluxor-solver/target/release/fluxor-solver /usr/local/bin/fluxor-solver
ENTRYPOINT ["/usr/local/bin/fluxor-solver"]
