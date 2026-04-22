import bpy
import os
from http.server import SimpleHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import socket
import threading
import ssl
import traceback

class CORSHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def stop_server_on_exit():
    # Ensure server_thread exists in globals
    if 'server_thread' not in globals():
        globals()['server_thread'] = None

    global server_thread
    # Check if server_thread is defined
    if server_thread:
        try:
            server_thread.stop()
        except Exception as e:
            print(f"Error stopping server on exit: {e}")

def generate_self_signed_cert(cert_path, key_path):
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    import datetime

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    cert = x509.CertificateBuilder() \
        .subject_name(subject) \
        .issuer_name(issuer) \
        .public_key(key.public_key()) \
        .serial_number(x509.random_serial_number()) \
        .not_valid_before(datetime.datetime.utcnow()) \
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365)) \
        .sign(key, hashes.SHA256(), default_backend())

    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))


class SecureHTTPServerThread(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def __init__(self, use_https=True, cert_path=None, key_path=None, port=None, http_port=None):
        # Check if cryptography module is available
        try:
            from cryptography import x509
            cryptography_available = True
        except ImportError:
            cryptography_available = False

        self.use_https = use_https and cryptography_available
        
        if self.use_https:
            # Use provided port or default HTTPS port
            self.port = port or 8443
            
            # Use provided certificate paths or addon defaults
            if cert_path and key_path:
                certfile = cert_path
                keyfile = key_path
            else:
                # Use addon's built-in certificates
                addon_dir = os.path.dirname(__file__)
                certfile = os.path.join(addon_dir, "cert.pem")
                keyfile = os.path.join(addon_dir, "key.pem")
            
            print(f"HTTPS Server Debug:")
            print(f"  Port: {self.port}")
            print(f"  Cert: {certfile} (exists: {os.path.exists(certfile)})")
            print(f"  Key: {keyfile} (exists: {os.path.exists(keyfile)})")

            if not os.path.exists(certfile) or not os.path.exists(keyfile):
                print(f"SSL certificates not found! Falling back to HTTP")
                self.use_https = False
                self.port = http_port or port or 8080
                super().__init__(('', self.port), CORSHTTPRequestHandler)
                print(f"Using HTTP server on port {self.port} (SSL certificates not found)")
                return

            # Initialize HTTP server first
            super().__init__(('', self.port), CORSHTTPRequestHandler)
            
            # Create SSL context (modern approach)
            ssl_success = False
            try:
                import ssl
                print(f"Creating SSL context...")
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                print(f"Loading certificate chain...")
                context.load_cert_chain(certfile, keyfile)
                print(f"Wrapping socket with SSL...")
                self.socket = context.wrap_socket(self.socket, server_side=True)
                print(f"HTTPS server successfully configured with SSL context")
                ssl_success = True
            except Exception as e:
                print(f"SSL context configuration failed: {e}")
                print(f"Trying legacy method...")
                try:
                    # Fallback to legacy SSL wrap_socket
                    self.socket = ssl.wrap_socket(
                        self.socket,
                        certfile=certfile,
                        keyfile=keyfile,
                        server_side=True,
                        ssl_version=ssl.PROTOCOL_TLS
                    )
                    print(f"HTTPS server configured with legacy SSL")
                    ssl_success = True
                except Exception as e2:
                    print(f"Legacy SSL method also failed: {e2}")
                    ssl_success = False
            
            if not ssl_success:
                print(f"All SSL methods failed, server will not work properly")
                raise Exception("Failed to configure SSL for HTTPS server")
        else:
            # Fall back to HTTP if cryptography is not available or use_https is False
            self.port = http_port or port or 8080
            super().__init__(('', self.port), CORSHTTPRequestHandler)
            reason = " (cryptography module not available)" if not cryptography_available else " (HTTPS disabled)"
            print(f"Using HTTP server on port {self.port}{reason}")
    
    def stop(self):
        """Stop the server"""
        self.shutdown()

class SimpleHTTPServerThread(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def __init__(self, port=None):
        self.port = port or 8080
        super().__init__(('', self.port), CORSHTTPRequestHandler)
    
    def stop(self):
        self.shutdown()

server_thread = None

def is_server_running():
    """Check if the server is currently running"""
    global server_thread
    return server_thread is not None

def get_server_info():
    """Get server information if running"""
    global server_thread
    if server_thread is not None:
        return {
            'running': True,
            'address': server_thread.server_address,
            'port': server_thread.server_address[1]
        }
    return {'running': False}

def register():
    try:
        bpy.utils.register_class(HTML_OT_StartServer)
        print(f"Registered class: HTML_OT_StartServer")
    except ValueError as e:
        if "register_class(...): already registered as a subclass" in str(e):
            print(f"Class HTML_OT_StartServer already registered, skipping")
        else:
            print(f"Error registering HTML_OT_StartServer: {e}")
            traceback.print_exc()

    try:
        bpy.utils.register_class(HTML_OT_StopServer)
        print(f"Registered class: HTML_OT_StopServer")
    except ValueError as e:
        if "register_class(...): already registered as a subclass" in str(e):
            print(f"Class HTML_OT_StopServer already registered, skipping")
        else:
            print(f"Error registering HTML_OT_StopServer: {e}")
            traceback.print_exc()

    # Add handler if it exists
    if hasattr(bpy.app.handlers, 'save_pre'):
        bpy.app.handlers.save_pre.append(stop_server_on_exit)

def unregister():
    try:
        bpy.utils.unregister_class(HTML_OT_StartServer)
        print(f"Unregistered class: HTML_OT_StartServer")
    except Exception as e:
        print(f"Error unregistering HTML_OT_StartServer: {e}")

    try:
        bpy.utils.unregister_class(HTML_OT_StopServer)
        print(f"Unregistered class: HTML_OT_StopServer")
    except Exception as e:
        print(f"Error unregistering HTML_OT_StopServer: {e}")

    # Remove handler if it exists
    if hasattr(bpy.app.handlers, 'save_pre'):
        try:
            bpy.app.handlers.save_pre.remove(stop_server_on_exit)
        except Exception as e:
            print(f"Error removing save_pre handler: {e}")

class HTML_OT_StartServer(bpy.types.Operator):
    bl_idname = "html.start_server"
    bl_label = "Start HTML Server"

    def execute(self, context):
        # Ensure server_thread exists in globals
        if 'server_thread' not in globals():
            globals()['server_thread'] = None

        global server_thread
        try:
            # Check if addon preferences exist
            if not context.preferences.addons.get(__package__):
                self.report({'ERROR'}, "Addon preferences not available")
                return {'CANCELLED'}

            prefs = context.preferences.addons[__package__].preferences

            # If HTTPS is not enabled, use HTTP
            if not prefs.use_https:
                if server_thread is None:
                    import shutil
                    
                    # Copy HTML template to Blender's temp directory
                    temp_dir = bpy.app.tempdir
                    html_path = os.path.join(temp_dir, "index.html")

                    # Get path to our resources directory
                    addon_dir = os.path.dirname(os.path.realpath(__file__))
                    template_path = os.path.join(addon_dir, "resources", "index.html")

                    if os.path.exists(template_path):
                        shutil.copy2(template_path, html_path)
                        
                        # Copy logos directory
                        logos_src = os.path.join(addon_dir, "resources", "logos")
                        logos_dst = os.path.join(temp_dir, "logos")
                        if os.path.exists(logos_src):
                            try:
                                if os.path.exists(logos_dst):
                                    shutil.rmtree(logos_dst)
                                shutil.copytree(logos_src, logos_dst)
                            except Exception as e:
                                self.report({'ERROR'}, f"Failed to copy logos directory: {e}")
                    else:
                        self.report({'ERROR'}, "HTML template not found in resources")
                        return {'CANCELLED'}

                    # Change to temp directory
                    os.chdir(temp_dir)

                    # Start HTTP server
                    server_thread = SimpleHTTPServerThread(port=prefs.http_port)

                    # Start serving in a separate thread
                    def serve_forever():
                        try:
                            server_thread.serve_forever()
                        except Exception as e:
                            print(f"Server error: {e}")
                            traceback.print_exc()

                    threading.Thread(target=serve_forever, daemon=True).start()

                    self.report({'INFO'}, f"Server started at http://{get_local_ip()}:{prefs.http_port}")
                    context.window_manager.clipboard = f"http://{get_local_ip()}:{prefs.http_port}"
                else:
                    self.report({'WARNING'}, "Server is already running")

                return {'FINISHED'}

            # Generate certs if needed for HTTPS
            # Use addon's built-in certificates by default, fallback to preferences if specified
            addon_dir = os.path.dirname(os.path.realpath(__file__))
            default_certfile = os.path.join(addon_dir, "cert.pem")
            default_keyfile = os.path.join(addon_dir, "key.pem")
            
            # Check if user has specified custom paths, otherwise use addon defaults
            if prefs.cert_path and prefs.cert_path != "//cert.pem":
                certfile = bpy.path.abspath(prefs.cert_path)
            else:
                certfile = default_certfile
                
            if prefs.key_path and prefs.key_path != "//key.pem":
                keyfile = bpy.path.abspath(prefs.key_path)
            else:
                keyfile = default_keyfile
            
            print(f"HTTPS Debug - Certificate paths:")
            print(f"  Cert file: {certfile} (exists: {os.path.exists(certfile)})")
            print(f"  Key file: {keyfile} (exists: {os.path.exists(keyfile)})")
            print(f"  Using addon defaults: {certfile == default_certfile}")
            
            if hasattr(prefs, 'auto_generate_certs'):
                if prefs.auto_generate_certs or not os.path.exists(certfile):
                    try:
                        print(f"Generating self-signed certificates...")
                        generate_self_signed_cert(certfile, keyfile)
                        print(f"Certificates generated successfully")
                    except ImportError as e:
                        if "No module named 'cryptography'" in str(e):
                            self.report({'ERROR'}, "SSL certificates not found and cryptography module is not installed. Cannot generate certificates.")
                            return {'CANCELLED'}
                        else:
                            raise
            elif not os.path.exists(certfile):
                try:
                    print(f"Generating self-signed certificates...")
                    generate_self_signed_cert(certfile, keyfile)
                    print(f"Certificates generated successfully")
                except ImportError as e:
                    if "No module named 'cryptography'" in str(e):
                        self.report({'ERROR'}, "SSL certificates not found and cryptography module is not installed. Cannot generate certificates.")
                        return {'CANCELLED'}
                    else:
                        raise

            # Check if server_thread is None
            if server_thread is None:
                import shutil
                
                # Copy HTML template to Blender's temp directory
                temp_dir = bpy.app.tempdir
                html_path = os.path.join(temp_dir, "index.html")

                # Get path to our resources directory
                addon_dir = os.path.dirname(os.path.realpath(__file__))
                template_path = os.path.join(addon_dir, "resources", "index.html")

                if os.path.exists(template_path):
                    shutil.copy2(template_path, html_path)
                    
                    # Copy logos directory
                    logos_src = os.path.join(addon_dir, "resources", "logos")
                    logos_dst = os.path.join(temp_dir, "logos")
                    if os.path.exists(logos_src):
                        try:
                            if os.path.exists(logos_dst):
                                shutil.rmtree(logos_dst)
                            shutil.copytree(logos_src, logos_dst)
                        except Exception as e:
                            self.report({'ERROR'}, f"Failed to copy logos directory: {e}")
                else:
                    self.report({'ERROR'}, "HTML template not found in resources")
                    return {'CANCELLED'}

                # Change to temp directory
                os.chdir(temp_dir)

                # Start server with preferences
                try:
                    if prefs.use_https:
                        server_thread = SecureHTTPServerThread(
                            use_https=True,
                            cert_path=certfile,
                            key_path=keyfile,
                            port=prefs.https_port
                        )
                        print(f"HTTPS server created successfully on port {prefs.https_port}")
                    else:
                        server_thread = SecureHTTPServerThread(
                            use_https=False,
                            port=prefs.http_port,
                            http_port=prefs.http_port
                        )
                        print(f"HTTP server created successfully on port {prefs.http_port}")
                except Exception as e:
                    self.report({'ERROR'}, f"Failed to create server: {e}")
                    print(f"Server creation failed: {e}")
                    traceback.print_exc()
                    return {'CANCELLED'}

                # Start serving in a separate thread
                def serve_forever():
                    try:
                        protocol = "HTTPS" if prefs.use_https else "HTTP"
                        print(f"Starting {protocol} server...")
                        server_thread.serve_forever()
                    except Exception as e:
                        print(f"Server error: {e}")
                        traceback.print_exc()

                threading.Thread(target=serve_forever, daemon=True).start()

                # Report the server URL based on the protocol used
                if prefs.use_https:
                    self.report({'INFO'}, f"Server started at https://{get_local_ip()}:{prefs.https_port}")
                    context.window_manager.clipboard = f"https://{get_local_ip()}:{prefs.https_port}"
                else:
                    self.report({'INFO'}, f"Server started at http://{get_local_ip()}:{prefs.http_port}")
                    context.window_manager.clipboard = f"http://{get_local_ip()}:{prefs.http_port}"
            else:
                if server_thread is not None:
                    self.report({'WARNING'}, "Server is already running")
                else:
                    self.report({'WARNING'}, "Server thread is not properly initialized")

            return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, f"Failed to start server: {e}")
            traceback.print_exc()
            return {'CANCELLED'}

class HTML_OT_StopServer(bpy.types.Operator):
    bl_idname = "html.stop_server"
    bl_label = "Stop HTML Server"

    def execute(self, context):
        # Ensure server_thread exists in globals
        if 'server_thread' not in globals():
            globals()['server_thread'] = None

        global server_thread

        # Check if server_thread is defined and is not None
        if server_thread:
            try:
                server_thread.stop()
                server_thread = None
                self.report({'INFO'}, "Server stopped")
            except Exception as e:
                self.report({'ERROR'}, f"Error stopping server: {e}")
        else:
            self.report({'WARNING'}, "No server is running")

        return {'FINISHED'}

