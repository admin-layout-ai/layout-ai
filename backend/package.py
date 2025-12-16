# Create this as package.py in your backend folder
import zipfile
import os

def create_deployment_zip():
    with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # Skip venv, __pycache__, etc.
            dirs[:] = [d for d in dirs if d not in ['venv', '__pycache__', '.git', 'node_modules']]
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, '.')
                # Force forward slashes
                arcname = arcname.replace('\\', '/')
                zipf.write(file_path, arcname)
    print("Created deploy.zip")

if __name__ == '__main__':
    create_deployment_zip()