#!/bin/bash
# Docker Setup Script for NestJS Template
# Works on Linux, macOS, and WSL

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}NestJS Template - Docker Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Function to clean up
cleanup() {
    echo -e "${YELLOW}Stopping existing containers...${NC}"
    docker compose down 2>/dev/null || true
    
    echo -e "${YELLOW}Removing old containers...${NC}"
    docker rm -f app-rabbitmq-dev 2>/dev/null || true
    docker rm -f app-mongodb-dev 2>/dev/null || true
}

# Function to setup
setup() {
    echo -e "${GREEN}Building RabbitMQ with delayed message plugin...${NC}"
    docker compose build --no-cache rabbitmq
    
    echo -e "${GREEN}Starting containers...${NC}"
    docker compose up -d
    
    echo -e "${YELLOW}Waiting for services to start (10 seconds)...${NC}"
    sleep 10
    
    echo -e "${GREEN}Checking RabbitMQ status...${NC}"
    docker exec app-rabbitmq-dev rabbitmq-diagnostics status || true
    
    echo -e "${GREEN}Verifying delayed message plugin...${NC}"
    docker exec app-rabbitmq-dev rabbitmq-plugins list | grep delayed
    
    echo -e "${GREEN}Verifying user authentication...${NC}"
    docker exec app-rabbitmq-dev rabbitmqctl authenticate_user app app123
}

# Main execution
case "${1:-setup}" in
    clean)
        echo -e "${YELLOW}Cleaning up everything (including volumes)...${NC}"
        cleanup
        docker volume rm nestjs-template_rabbitmq_dev_data 2>/dev/null || true
        docker volume rm nestjs-template_mongodb_dev_data 2>/dev/null || true
        echo -e "${GREEN}Cleanup complete!${NC}"
        ;;
    restart)
        echo -e "${YELLOW}Restarting containers...${NC}"
        docker compose restart
        echo -e "${GREEN}Restart complete!${NC}"
        ;;
    logs)
        docker compose logs -f
        ;;
    status)
        docker compose ps
        echo ""
        echo -e "${GREEN}RabbitMQ Management UI:${NC} http://localhost:15673"
        echo -e "${GREEN}MongoDB:${NC} mongodb://localhost:27017"
        ;;
    setup|*)
        cleanup
        setup
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}Setup Complete!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "${GREEN}Services:${NC}"
        echo -e "  - MongoDB: mongodb://localhost:27017"
        echo -e "  - RabbitMQ: amqp://app:app123@localhost:5673"
        echo -e "  - RabbitMQ Management: http://localhost:15673 (user: app, pass: app123)"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo -e "  1. Update .env file: RMQ_URI=amqp://app:app123@localhost:5673/"
        echo -e "  2. Run: bun dev"
        echo ""
        echo -e "${YELLOW}Other commands:${NC}"
        echo -e "  ./docker-setup.sh restart  - Restart containers"
        echo -e "  ./docker-setup.sh clean    - Clean everything (including volumes)"
        echo -e "  ./docker-setup.sh logs     - View logs"
        echo -e "  ./docker-setup.sh status   - Check status"
        ;;
esac
