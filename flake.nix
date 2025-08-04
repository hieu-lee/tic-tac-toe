{
  description = "Fill a form using AI";

  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        # To import a flake module
        # 1. Add foo to inputs
        # 2. Add foo as a parameter to the outputs function
        # 3. Add here: foo.flakeModule

      ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      perSystem =
        {
          config,
          self',
          inputs',
          pkgs,
          system,
          ...
        }:
        {
          # Per-system attributes can be defined here. The self' and inputs'
          # module parameters provide easy access to attributes of the same
          # system.

          # Equivalent to  inputs'.nixpkgs.legacyPackages.hello;
          devShells.default =
            let
              kagglehub = pkgs.python313Packages.buildPythonPackage rec {
                pname = "kagglehub";
                version = "0.3.12";
                pyproject = true;

                src = pkgs.fetchPypi {
                  inherit pname version;
                  sha256 = "sha256-RedYVGMKMGBbeU63hrN1e+zLvqGsynFgBkL2e2Dg178=";
                };

                nativeBuildInputs = [ pkgs.python313Packages.hatchling ];

                dependencies = [
                  (pkgs.python313.withPackages (
                    ps: with ps; [
                      pyyaml
                      requests
                      tqdm
                    ]
                  ))
                ];

                pythonImportsCheck = [ "kagglehub" ];
              };

              mrz = pkgs.python313Packages.buildPythonPackage rec {
                pname = "mrz";
                version = "0.6.2";

                format = "setuptools";

                src = pkgs.fetchPypi {
                  inherit pname version;
                  sha256 = "sha256-VLs7NwzMNxt/uGwFrdiHQ0bnqGaY2IIsSITLYZBP+O4=";
                };

                nativeBuildInputs = with pkgs.python311Packages; [
                  setuptools
                  wheel
                ];
                # propagatedBuildInputs = with pkgs.python311Packages; [
                #   future
                # ];

                pythonImportsCheck = [ "mrz" ];
              };

              passport_mrz_extractor = pkgs.python313Packages.buildPythonPackage rec {
                pname = "passport_mrz_extractor";
                version = "1.0.13";

                format = "setuptools";

                src = pkgs.fetchPypi {
                  inherit pname version;
                  sha256 = "sha256-EKuQTke2sX1UYphNYWjQq2ZMvajQbJUxDB3pKcDujZM=";
                };

                # nativeBuildInputs = [ pkgs.python313Packages.hatchling ];

                dependencies = [
                  (pkgs.python313.withPackages (
                    ps: with ps; [
                      pillow
                      pytesseract
                      opencv-python
                      mrz
                    ]
                  ))
                ];

                pythonImportsCheck = [ "passport_mrz_extractor" ];
              };
            in
            pkgs.mkShell {
              nativeBuildInputs = with pkgs; [
                nixpkgs-fmt
                (python313.withPackages (
                  ps: with ps; [

                    accelerate
                    docling
                    fastapi
                    google-generativeai
                    groq
                    kagglehub
                    markitdown
                    mrz
                    openai
                    passport_mrz_extractor
                    pdf2image
                    pdfplumber
                    pillow
                    pip
                    pyinstaller
                    pymupdf
                    pypdf
                    pyperclip
                    pytesseract
                    python-docx
                    requests
                    timm
                    transformers
                    uvicorn
                  ]
                ))

                # Nodejs
                nodejs_24

                # ollama
                ollama

                # pandoc
                pandoc
              ];

            };
        };
      flake = {
        # The usual flake attributes can be defined here, including system-
        # agnostic ones like nixosModule and system-enumerating ones, although
        # those are more easily expressed in perSystem.
      };
    };
}
