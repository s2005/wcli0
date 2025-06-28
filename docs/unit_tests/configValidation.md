# configValidation

- **throws for nonpositive maxCommandLength** – ensures validation rejects negative or zero maxCommandLength values.
- **throws for enabled shell missing executable fields** – detects incomplete shell executable settings.
- **throws for commandTimeout below 1** – enforces a minimum timeout of one second.
- **passes for valid configuration** – confirms that a properly formed config does not throw.
