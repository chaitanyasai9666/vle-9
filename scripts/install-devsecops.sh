#!/bin/bash
# Step 2: install the DevSecOps toolchain on Ubuntu 24.04 (EC2)
set -x
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
# SonarQube (Elasticsearch) kernel limits
echo 'vm.max_map_count=524288' | sudo tee /etc/sysctl.d/99-sonarqube.conf
echo 'fs.file-max=131072' | sudo tee -a /etc/sysctl.d/99-sonarqube.conf
sudo sysctl --system
# Base tools
sudo -E apt-get update -q
sudo -E apt-get install -y -q docker.io git curl unzip jq fontconfig openjdk-21-jre conntrack
sudo usermod -aG docker ubuntu
# Jenkins
sudo wget -qO /etc/apt/keyrings/jenkins-keyring.asc https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key
echo 'deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/' | sudo tee /etc/apt/sources.list.d/jenkins.list
# Trivy
wget -qO- https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo gpg --dearmor -o /usr/share/keyrings/trivy.gpg
echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" | sudo tee /etc/apt/sources.list.d/trivy.list
sudo -E apt-get update -q
sudo -E apt-get install -y -q jenkins trivy
sudo usermod -aG docker jenkins
# SonarQube server (container)
docker run -d --name sonarqube --restart unless-stopped -p 9000:9000 sonarqube:community
# sonar-scanner + OWASP ZAP via official images, wrapped so the manual's commands work unchanged
docker pull sonarsource/sonar-scanner-cli
docker pull ghcr.io/zaproxy/zaproxy:stable
printf '#!/bin/sh\nexec docker run --rm --network host -e SONAR_TOKEN -v "$(pwd):/usr/src" sonarsource/sonar-scanner-cli "$@"\n' | sudo tee /usr/local/bin/sonar-scanner
printf '#!/bin/sh\nexec docker run --rm --network host -v "$(pwd):/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py "$@"\n' | sudo tee /usr/local/bin/zap-baseline.py
sudo chmod +x /usr/local/bin/sonar-scanner /usr/local/bin/zap-baseline.py
# Kubernetes: minikube, kubectl, helm
curl -sLO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && sudo install minikube-linux-amd64 /usr/local/bin/minikube
curl -sLO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && sudo install kubectl /usr/local/bin/kubectl
sudo snap install helm --classic
minikube start --driver=docker --memory=6144 --cpus=2
echo INSTALL-COMPLETE
