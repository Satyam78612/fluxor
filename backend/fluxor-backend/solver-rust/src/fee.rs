/// Apply integrator fee (0.1%) to output amount
/// output_after_fee = output * 0.999
pub fn apply_integrator_fee(output: f64) -> f64 {
    output * 0.999
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integrator_fee() {
        let output = 1.0;
        let after_fee = apply_integrator_fee(output);
        assert!((after_fee - 0.999).abs() < 1e-9);
    }
}
