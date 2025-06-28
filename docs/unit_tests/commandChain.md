# commandChain

- **allows cd within allowed path** – verifies that chained commands containing a `cd` to a directory under the allowed paths list do not throw an error when validated.
- **rejects cd to disallowed path** – ensures that attempting to `cd` into a directory outside the allowed paths causes validation to throw.
- **rejects relative cd escaping allowed path** – checks that using a relative `cd ..` to leave the permitted directory is blocked.
- **rejects blocked commands and arguments in chain** – confirms that blocked commands or arguments in a chained command cause validation to fail.
