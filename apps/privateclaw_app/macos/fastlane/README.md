fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Mac

### mac build_release

```sh
[bundle exec] fastlane mac build_release
```

Build an App Store signed macOS package for PrivateClaw

### mac metadata

```sh
[bundle exec] fastlane mac metadata
```

Upload localized macOS metadata only

### mac upload_release

```sh
[bundle exec] fastlane mac upload_release
```

Submit the existing macOS App Store Connect build for App Store review

### mac release

```sh
[bundle exec] fastlane mac release
```

Build and submit a production macOS App Store release

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
