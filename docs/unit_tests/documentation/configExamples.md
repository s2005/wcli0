# documentation/configExamples

- **sample config is valid** – ensures the example config file in `config.examples/config.sample.json` parses and loads without errors.
- **all shells in examples have correct structure** – verifies that each shell definition in the example configs has the required fields like `enabled`, `executable`, and optional override sections.
- **development config allows longer timeouts** – checks that the development example enables higher command timeouts.
- **production config is restrictive** – confirms that the production example applies strict security limits such as short timeouts and many blocked commands.
- **minimal config has minimal restrictions** – validates that the minimal example only enables the bare minimum shell and keeps restrictions loose.
