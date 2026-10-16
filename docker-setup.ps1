# Docker Setup Script for NestJS Template
# Works on Windows PowerShell

param(
    [Parameter(Position=0)]
    [ValidateSet("setup", "clean", "restart", "logs", "status")]
    [string]$Action = "setup"
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "========================================" -ForegroundColor Green
Write-Host "NestJS Template - Docker Setup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Check if docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed" -ForegroundColor Red
    exit 1
}

function Cleanup {
    Write-Host "Stopping existing containers..." -ForegroundColor Yellow
    docker compose down 2>$null
    
    Write-Host "Removing old containers..." -ForegroundColor Yellow
    docker rm -f app-rabbitmq-dev 2>$null
    docker rm -f app-mongodb-dev 2>$null
}

function Setup {
    Write-Host "Building RabbitMQ with delayed message plugin..." -ForegroundColor Green
    docker compose build --no-cache rabbitmq
    
    Write-Host "Starting containers..." -ForegroundColor Green
    docker compose up -d
    
    Write-Host "Waiting for services to start (10 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    Write-Host "Checking RabbitMQ status..." -ForegroundColor Green
    docker exec app-rabbitmq-dev rabbitmq-diagnostics status
    
    Write-Host "Verifying delayed message plugin..." -ForegroundColor Green
    docker exec app-rabbitmq-dev rabbitmq-plugins list | Select-String "delayed"
    
    Write-Host "Verifying user authentication..." -ForegroundColor Green
    docker exec app-rabbitmq-dev rabbitmqctl authenticate_user app app123
}

switch ($Action) {
    "clean" {
        Write-Host "Cleaning up everything (including volumes)..." -ForegroundColor Yellow
        Cleanup
        docker volume rm nestjs-template_rabbitmq_dev_data 2>$null
        docker volume rm nestjs-template_mongodb_dev_data 2>$null
        Write-Host "Cleanup complete!" -ForegroundColor Green
    }
    "restart" {
        Write-Host "Restarting containers..." -ForegroundColor Yellow
        docker compose restart
        Write-Host "Restart complete!" -ForegroundColor Green
    }
    "logs" {
        docker compose logs -f
    }
    "status" {
        docker compose ps
        Write-Host ""
        Write-Host "RabbitMQ Management UI: " -ForegroundColor Green -NoNewline
        Write-Host "http://localhost:15673"
        Write-Host "MongoDB: " -ForegroundColor Green -NoNewline
        Write-Host "mongodb://localhost:27017"
    }
    default {
        Cleanup
        Setup
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Setup Complete!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Services:" -ForegroundColor Green
        Write-Host "  - MongoDB: mongodb://localhost:27017"
        Write-Host "  - RabbitMQ: amqp://app:app123@localhost:5673"
        Write-Host "  - RabbitMQ Management: http://localhost:15673 (user: app, pass: app123)"
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Update .env file: RMQ_URI=amqp://app:app123@localhost:5673/"
        Write-Host "  2. Run: bun dev"
        Write-Host ""
        Write-Host "Other commands:" -ForegroundColor Yellow
        Write-Host "  .\docker-setup.ps1 restart  - Restart containers"
        Write-Host "  .\docker-setup.ps1 clean    - Clean everything (including volumes)"
        Write-Host "  .\docker-setup.ps1 logs     - View logs"
        Write-Host "  .\docker-setup.ps1 status   - Check status"
    }
}
