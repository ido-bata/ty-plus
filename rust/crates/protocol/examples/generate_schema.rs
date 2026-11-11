fn main() -> Result<(), Box<dyn std::error::Error>> {
    print!("{}", ty_plus_protocol::schema::generate_schema_json()?);
    Ok(())
}
