# types/configTypes

- **identifies WSL shell config** – confirms that the type guard detects objects with a wslConfig section.
- **identifies non-WSL shell config** – ensures standard shell configs are not mistaken for WSL configs.
- **handles undefined** – the guard should safely return false for undefined values.
- **handles empty object** – verifies an empty object is not treated as a WSL config.
- **identifies objects with wslConfig** – ensures the hasWslConfig helper recognizes objects containing a wslConfig property.
- **identifies objects without wslConfig** – verifies the helper returns false when the property is missing.
- **handles null and undefined** – checks that null or undefined values do not cause errors and return false.
- **handles wslConfig that is not an object** – ensures the helper ignores non-object wslConfig values.
