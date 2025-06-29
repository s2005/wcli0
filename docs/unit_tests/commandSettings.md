# commandSettings

- **blocks dangerous operators when injection protection enabled** – ensures chained commands containing blocked shell operators are rejected when injection protection is active.
- **allows command chaining when injection protection disabled** – verifies that disabling injection protection permits safe chained commands.
- **allows changing directory outside allowed paths when restriction disabled** – confirms unrestricted working directory settings allow `cd` into disallowed paths.
- **rejects changing directory outside allowed paths when restriction enabled** – checks that enabling the restriction prevents `cd` to directories beyond the allowed list.
