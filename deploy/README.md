# VM deployment after local validation

Use an Ubuntu VM only after the dataset has been verified and the static dashboard has been tested. A static dashboard does not require an application database or secret keys.

## Oracle Cloud Always Free outline

1. Create an Always Free eligible Ubuntu compute instance in your home region.
2. Restrict inbound access to ports 80 and 443 only; keep SSH restricted to your own IP or use the provider console connection.
3. Install Docker using the provider's current Ubuntu documentation.
4. Copy this project to the VM, then from the project root run `docker build -t wildfire-readiness-atlas -f deploy/Dockerfile .` and `docker run -d --restart unless-stopped -p 80:80 --name wildfire-readiness-atlas wildfire-readiness-atlas`.
5. Add HTTPS and a custom domain before sharing broadly.

Never place a NASA FIRMS MAP_KEY in the browser, source repository, Kaggle notebook output, or public VM image. If a later version needs scheduled private-key data refreshes, add a small server-side job with environment variables and a documented rotation process.
