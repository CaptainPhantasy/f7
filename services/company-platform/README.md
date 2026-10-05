# Company platform

This service gives company members their own accounts and connects the coding app to shared models and tools. The owner manages accounts, provider details and the administrator key from the administration page.

Install the small dependency list with `python3 -m pip install -r requirements.txt`, then run `python3 test_platform.py` to check account boundaries, administrator key changes, model replies and tool inputs. PyYAML reads optional local model settings.

Keep `config.json`, the administrator key, account records and uploads outside source control. Existing service installations retain those files when these source files are updated. Serve the private local listener through the company’s secure network and existing web server.

`company-tools.mjs` runs through the coding app’s built-in program runner and uses the signed-in member’s saved access. It never includes the owner’s server credentials.

The portable app includes its command window and closes old page connections during restart so the browser can reconnect.

Set company addresses and optional tool paths in private `config.json`: `company_model_base`, `company_model_settings`, `company_download_url`, `company_gateway_root`, `speech_model`, and `speech_command`. These settings have no built-in private company addresses. The download link uses only the configured address. When adding company tools, provide `FLOYD_CODE_BASE_URL` and `FLOYD_CODE_CDN_BASE` in the environment.
