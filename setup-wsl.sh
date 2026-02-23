#!/bin/bash
# Setup script for WSL environment

echo "Setting up NOVA environment in WSL..."

# Update package manager
echo "Updating package manager..."
sudo apt-get update -qq

# Install Python venv
echo "Installing python3-venv..."
sudo apt-get install -y python3.12-venv 2>&1 | grep -E "(unpacking|Setting up)" || true

# Install pip if needed
echo "Installing pip..."
sudo apt-get install -y python3-pip 2>&1 | grep -E "(unpacking|Setting up)" || true

# Navigate to project directory 
PROJECT_DIR="/mnt/d/Proyectos/nova-agent"
echo "Project directory: $PROJECT_DIR"
cd "$PROJECT_DIR" || exit 1

# Create virtual endvironment
if [ ! -d ".venv-wsl" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv-wsl
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv-wsl/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip setuptools wheel -q

# Install required packages
echo "Installing Python dependencies..."
pip install -q python-dotenv langchain langchain-openai tiktoken 2>&1 | tail -3

# Verify installation
echo ""
echo "Verifying installation..."
python3 -c "
import sys
packages = {'dotenv': 'python-dotenv', 'langchain': 'langchain', 'langchain_openai': 'langchain-openai', 'tiktoken': 'tiktoken'}
missing = []
for module, pkg in packages.items():
    try:
        __import__(module)
        print(f'✓ {pkg}')
    except ImportError as e:
        print(f'✗ {pkg}')
        missing.append(pkg)

if missing:
    print(f'\nWarning: Some packages failed to install: {missing}')
else:
    print('\n✓ All dependencies installed successfully!')
"

echo ""
echo "✓ Setup complete!"
echo ""
echo "To use the environment in WSL, run:"
echo "  source .venv-wsl/bin/activate"
echo ""
echo "Then test the CLI with:"
echo "  python -m agent.cli"
