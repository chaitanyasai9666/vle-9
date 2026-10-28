// Step 10: CI/CD secure pipeline
pipeline {
  agent any
  stages {
    stage('Build') {
      steps { sh 'docker build -t app -t myapp:latest .' }
    }
    stage('SAST') {
      steps {
        // Secrets management: token comes from the Jenkins credential store, never from code
        withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
          sh 'sonar-scanner'
        }
      }
    }
    stage('Security Scan') {
      // Security gate: fail the build on any HIGH/CRITICAL vulnerability
      steps { sh 'trivy image --severity HIGH,CRITICAL --exit-code 1 app' }
    }
    stage('Deploy') {
      steps {
        sh 'minikube image load myapp:latest'
        sh 'kubectl apply -f k8s/deployment.yaml'
        sh 'kubectl rollout restart deploy/healthcare-app -n healthcare'
        sh 'kubectl rollout status deploy/healthcare-app -n healthcare --timeout=120s'
      }
    }
    stage('DAST') {
      steps {
        sh 'mkdir -p zap && chmod 777 zap && cd zap && zap-baseline.py -t http://192.168.49.2:30080 -r zap-report.html -I'
        archiveArtifacts artifacts: 'zap/zap-report.html'
      }
    }
  }
}
