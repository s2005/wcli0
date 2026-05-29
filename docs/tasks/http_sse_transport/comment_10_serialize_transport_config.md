# P10 - Include transport in serialized config

Adding `transport` to `ServerConfig` (`src/types/config.ts:271`) did not update
`createSerializableConfig()`, which still serializes only `global` and `shells`.
Consequently `get_config` and `cli://config` omit the active transport
mode/host/port even when the server runs with SSE or a custom bind address.
Since these handlers advertise the complete server configuration, include
`config.transport` in the serializable object so clients can inspect the actual
connection settings.
