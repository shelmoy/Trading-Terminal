using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

// Windows GUI subsystem launcher: no console, embedded icon, persistent startup logs.
internal static class TradingServersLauncher
{
    private static readonly object LogLock = new object();

    private static string Quote(string value)
    {
        if (value.IndexOf('"') >= 0) throw new ArgumentException("Invalid quote in launcher path.");
        return "\"" + value.TrimEnd('\\') + "\"";
    }

    [STAThread]
    private static int Main(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string logPath = Path.Combine(root, "launcher.log");
        try
        {
            var command = new StringBuilder("-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File ");
            command.Append(Quote(Path.Combine(root, "BrokerServers.ps1")));
            for (int i = 0; i < args.Length; i += 2)
            {
                if (i + 1 >= args.Length || (args[i] != "-PrimaryRoot" && args[i] != "-FyersRoot" && args[i] != "-StateRoot"))
                    throw new ArgumentException("Invalid launcher arguments.");
                command.Append(" ").Append(args[i]).Append(" ").Append(Quote(Path.GetFullPath(args[i + 1])));
            }
            var start = new ProcessStartInfo {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
                Arguments = command.ToString(), WorkingDirectory = root,
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            using (var process = new Process { StartInfo = start })
            {
                DataReceivedEventHandler write = delegate(object sender, DataReceivedEventArgs line) {
                    if (line.Data != null) lock (LogLock) File.AppendAllText(logPath, DateTime.Now.ToString("s") + " " + line.Data + Environment.NewLine);
                };
                process.OutputDataReceived += write;
                process.ErrorDataReceived += write;
                process.Start();
                process.BeginOutputReadLine(); process.BeginErrorReadLine();
                process.WaitForExit();
                if (process.ExitCode != 0)
                    throw new InvalidOperationException("The controller could not start. Details: " + logPath);
                return 0;
            }
        }
        catch (Exception error)
        {
            try { File.AppendAllText(logPath, DateTime.Now.ToString("s") + " " + error + Environment.NewLine); } catch { }
            MessageBox.Show(error.Message, "Trading Servers", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
