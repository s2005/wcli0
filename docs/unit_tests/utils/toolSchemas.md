# utils/toolSchemas

- **generates schema with all enabled shells** – verifies that the execute_command schema includes every enabled shell.
- **includes shell descriptions with settings** – ensures enum descriptions mention shell-specific timeout values and path formats.
- **throws error when no shells enabled** – buildExecuteCommandSchema should reject an empty shell list.
- **includes shell parameter when shells are enabled** – buildValidateDirectoriesSchema should expose the shell property when shells exist.
- **excludes shell parameter when no shells enabled** – confirms the schema omits the shell field when validation is purely global.
