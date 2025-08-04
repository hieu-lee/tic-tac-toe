# How to use

## Run in dev mode

```bash
npm install
npm start
```

## Package + run the app in production

```bash
npm run package
open ./out/FormFillerAI-darwin-arm64/FormFillerAI.app
```

## Build python script

```bash
cd src/scripts
chmod +x build.sh
./build.sh # this will take all python files in src/scripts and compile them
# The built binaries will reside in assets/python
```

## Get React devtools

```bash
npm install -g react-devtools
react-devtools
```
