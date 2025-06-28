# toolDescription

- **generates correct description with all shells enabled** – checks that the tool description lists every enabled shell and includes example blocks for each.
- **generates correct description with only cmd enabled** – verifies that the description includes only the CMD example when other shells are disabled.
- **generates correct description with powershell and gitbash enabled** – ensures that only the relevant examples for enabled shells are present.
- **handles empty allowed shells array** – confirms that an empty shell list results in a minimal description without examples.
- **handles unknown shell names** – tests that unrecognized shell names appear in the header but no examples are generated.
