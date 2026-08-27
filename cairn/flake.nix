{
  description = "Dev shell for Cairn (mastery learning engine: client, core, server)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      # aarch64-linux is a first-class target: the site server runs on a Pi 4
      # (64-bit Raspberry Pi OS; Bun does not support 32-bit ARM).
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun # target runtime (single-file compile, built-in SQLite)
            nodejs_24 # Node-portability check + npm tooling (vitest, tsc)
            # step 3 will add Playwright browsers here for the E2E layer
          ];
        };
      });
    };
}
