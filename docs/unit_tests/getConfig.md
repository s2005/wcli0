# getConfig

- **createSerializableConfig returns structured configuration** – verifies that `createSerializableConfig` produces a plain object without functions and with the expected fields from the configuration.
- **createSerializableConfig returns consistent config structure** – checks that the structure of the serialized config always contains the necessary keys for security and shell settings.
- **get_config tool response format** – ensures the response format produced by the configuration tool is correctly shaped and contains the serialized config.
