# Desktop presentation only. Server actions remain in BrokerServers.ps1.
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
# Keep text and surfaces independent of desktop acrylic/GPU alpha composition.
[Windows.Media.RenderOptions]::ProcessRenderMode = [Windows.Interop.RenderMode]::SoftwareOnly
if (-not ('TradingGlassWindow' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TradingGlassWindow {
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    public static void Apply(IntPtr hwnd) {
        int corner = 2, backdrop = 1;
        DwmSetWindowAttribute(hwnd, 33, ref corner, 4);
        DwmSetWindowAttribute(hwnd, 38, ref backdrop, 4);
    }
}
'@
}
[xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Trading Servers" Width="720" Height="620" WindowStartupLocation="CenterScreen"
        WindowStyle="None" ResizeMode="NoResize" Background="#EEF3FA" Foreground="#182B45" Opacity="1" FontFamily="Segoe UI" FontSize="14">
  <Window.Resources>
    <Style TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="Foreground" Value="#24334D"/>
      <Setter Property="Background" Value="#C9FFFFFF"/><Setter Property="BorderBrush" Value="#EFFFFFFF"/>
      <Setter Property="BorderThickness" Value="1"/><Setter Property="Padding" Value="18,13"/>
      <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button">
        <Border x:Name="Surface" CornerRadius="14" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}">
          <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" Margin="{TemplateBinding Padding}"/>
        </Border>
        <ControlTemplate.Triggers>
          <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Surface" Property="Opacity" Value="0.78"/></Trigger>
          <Trigger Property="IsPressed" Value="True"><Setter TargetName="Surface" Property="Opacity" Value="0.58"/></Trigger>
          <Trigger Property="IsEnabled" Value="False"><Setter TargetName="Surface" Property="Opacity" Value="0.4"/></Trigger>
        </ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
    <Style TargetType="CheckBox">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="VerticalContentAlignment" Value="Center"/>
      <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="CheckBox">
        <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="30"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
          <Border x:Name="Toggle" Width="21" Height="21" CornerRadius="7" BorderBrush="#8195B2" BorderThickness="1" Background="#70FFFFFF"/>
          <Path x:Name="Tick" Data="M 1,5 L 5,9 L 12,1" Stroke="White" StrokeThickness="2" Width="12" Height="10" Visibility="Collapsed"/>
          <ContentPresenter Grid.Column="1" VerticalAlignment="Center" Margin="10,0,0,0"/>
        </Grid>
        <ControlTemplate.Triggers>
          <Trigger Property="IsChecked" Value="True"><Setter TargetName="Toggle" Property="Background" Value="#2374E8"/><Setter TargetName="Toggle" Property="BorderBrush" Value="#2374E8"/><Setter TargetName="Tick" Property="Visibility" Value="Visible"/></Trigger>
          <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.5"/></Trigger>
        </ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Border CornerRadius="22" BorderBrush="#E8FFFFFF" BorderThickness="1">
    <Border.Background><LinearGradientBrush StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#F4FAFF"/><GradientStop Color="#ECF0FA" Offset="0.55"/><GradientStop Color="#E0F4F5" Offset="1"/></LinearGradientBrush></Border.Background>
    <Grid Margin="28,18,28,24">
      <Grid.RowDefinitions><RowDefinition Height="40"/><RowDefinition Height="86"/><RowDefinition Height="180"/><RowDefinition Height="76"/><RowDefinition Height="*"/><RowDefinition Height="28"/></Grid.RowDefinitions>
      <Grid x:Name="TitleBar" Background="Transparent">
        <StackPanel Orientation="Horizontal" VerticalAlignment="Top">
          <Button x:Name="CloseWindow" Width="14" Height="14" Padding="0" Background="#FF6058" BorderBrush="#E44A43" ToolTip="Close controller"/>
          <Button x:Name="MinimizeWindow" Width="14" Height="14" Margin="9,0,0,0" Padding="0" Background="#FFBD2E" BorderBrush="#DDA125" ToolTip="Minimize"/>
          <Ellipse Width="14" Height="14" Margin="9,0,0,0" Fill="#28C840" Stroke="#24AA35" IsHitTestVisible="False"/>
        </StackPanel>
        <TextBlock Text="TRADING WORKSPACE" FontSize="10" FontWeight="SemiBold" Foreground="#64768F" HorizontalAlignment="Right"/>
      </Grid>
      <Grid Grid.Row="1"><Grid.ColumnDefinitions><ColumnDefinition Width="68"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
        <Image x:Name="AppIcon" Width="52" Height="52" VerticalAlignment="Top"/>
        <StackPanel Grid.Column="1"><TextBlock Text="Trading Servers" FontSize="29" FontWeight="SemiBold" Foreground="#182B45"/>
          <TextBlock Text="Two brokers. One calm workspace." Margin="1,6,0,0" Foreground="#60738B" FontSize="14"/></StackPanel>
      </Grid>
      <StackPanel Grid.Row="2">
        <Border CornerRadius="17" Background="#BFFFFFFF" BorderBrush="#F5FFFFFF" BorderThickness="1" Padding="18,15" Margin="0,0,0,12">
          <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="160"/></Grid.ColumnDefinitions>
            <CheckBox x:Name="KotakCheck" IsChecked="True"><StackPanel><TextBlock Text="Kotak Neo" Foreground="#22364F" FontWeight="SemiBold" FontSize="16"/><TextBlock Text="127.0.0.1:5000" Foreground="#77869A" FontSize="12" Margin="0,3,0,0"/></StackPanel></CheckBox>
            <TextBlock x:Name="KotakStatus" Grid.Column="1" Text="Checking…" HorizontalAlignment="Right" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#687B93"/>
          </Grid>
        </Border>
        <Border CornerRadius="17" Background="#BFFFFFFF" BorderBrush="#F5FFFFFF" BorderThickness="1" Padding="18,15">
          <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="160"/></Grid.ColumnDefinitions>
            <CheckBox x:Name="FyersCheck" IsChecked="True"><StackPanel><TextBlock Text="FYERS" Foreground="#22364F" FontWeight="SemiBold" FontSize="16"/><TextBlock Text="127.0.0.1:5001" Foreground="#77869A" FontSize="12" Margin="0,3,0,0"/></StackPanel></CheckBox>
            <TextBlock x:Name="FyersStatus" Grid.Column="1" Text="Checking…" HorizontalAlignment="Right" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#687B93"/>
          </Grid>
        </Border>
      </StackPanel>
      <UniformGrid Grid.Row="3" Columns="3" VerticalAlignment="Center">
        <Button x:Name="StartButton" Tag="Start" Margin="0,0,8,0" Foreground="White" BorderBrush="#608DD9FF"><Button.Background><LinearGradientBrush StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#3C9AF6"/><GradientStop Color="#2263DC" Offset="1"/></LinearGradientBrush></Button.Background><TextBlock Text="▶   Start" FontWeight="SemiBold"/></Button>
        <Button x:Name="StopButton" Tag="Stop" Margin="4,0,4,0" Foreground="#BA445A"><TextBlock Text="■   Stop" FontWeight="SemiBold"/></Button>
        <Button x:Name="RestartButton" Tag="Restart" Margin="8,0,0,0"><TextBlock Text="↻   Restart" FontWeight="SemiBold"/></Button>
      </UniformGrid>
      <Border Grid.Row="4" CornerRadius="15" Background="#80FFFFFF" BorderBrush="#DDFFFFFF" BorderThickness="1" Padding="16,12" Margin="0,3,0,12">
        <Grid><Grid.RowDefinitions><RowDefinition Height="25"/><RowDefinition Height="*"/></Grid.RowDefinitions>
          <TextBlock Text="ACTIVITY" FontWeight="SemiBold" FontSize="10" Foreground="#6A7D96"/>
          <TextBox x:Name="Activity" Grid.Row="1" Text="Select your brokers, then Start. Both pages open as tabs in Chrome." IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Background="Transparent" BorderThickness="0" Foreground="#435B77" FontSize="12"/>
        </Grid>
      </Border>
      <TextBlock Grid.Row="5" Text="Closing this window keeps your broker servers running." Foreground="#6B7D92" FontSize="12" HorizontalAlignment="Center" VerticalAlignment="Bottom"/>
    </Grid>
  </Border>
</Window>
'@
$reader = New-Object Xml.XmlNodeReader $markup
$window = [Windows.Markup.XamlReader]::Load($reader)
$reader.Close()
$checks = @{ Kotak = $window.FindName('KotakCheck'); Fyers = $window.FindName('FyersCheck') }
$labels = @{ Kotak = $window.FindName('KotakStatus'); Fyers = $window.FindName('FyersStatus') }
$buttons = @('StartButton', 'StopButton', 'RestartButton') | ForEach-Object { $window.FindName($_) }
$log = $window.FindName('Activity')
$iconPath = Join-Path $PSScriptRoot 'TradingServers-Glass.ico'
if (Test-Path -LiteralPath $iconPath) {
    # Load the pixels eagerly, so an open controller never locks its installed icon.
    $iconStream = [IO.File]::OpenRead($iconPath)
    try {
        $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($iconStream, [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
        $window.Icon = $decoder.Frames | Sort-Object PixelWidth -Descending | Select-Object -First 1
        $window.Icon.Freeze()
    } finally { $iconStream.Dispose() }
    $window.FindName('AppIcon').Source = $window.Icon
}
$window.FindName('CloseWindow').Add_Click({ $window.Close() })
$window.FindName('MinimizeWindow').Add_Click({ $window.WindowState = 'Minimized' })
$window.FindName('TitleBar').Add_MouseLeftButtonDown({ if ($_.OriginalSource -isnot [Windows.Controls.Button]) { $window.DragMove() } })
$window.Add_SourceInitialized({
    $handle = (New-Object Windows.Interop.WindowInteropHelper $window).Handle
    [TradingGlassWindow]::Apply($handle)
})
$runtime = @{ Operation = $null; Status = $null; NextStatus = [datetime]::MinValue; Output = $null; ErrorLog = $null }
$statusPath = Join-Path $StateRoot 'ui-status.json'
$engine = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $engine)) { $engine = Join-Path $PSHOME 'pwsh.exe' }
# This file is dot-sourced from the controller; use the controller for child actions.
$commonArgs = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -PrimaryRoot "{1}" -FyersRoot "{2}" -StateRoot "{3}" -StatusFile "{4}"' -f (Join-Path $PSScriptRoot 'BrokerServers.ps1'), $PrimaryRoot, $FyersRoot, $StateRoot, $statusPath
foreach ($button in $buttons) {
    $button.Add_Click({
        $names = @($instances | Where-Object { $checks[$_.Name].IsChecked } | ForEach-Object { $_.Name })
        if (-not $names.Count) { $log.Text = 'Select Kotak, FYERS, or both first.'; return }
        $target = if ($names.Count -eq 2) { 'All' } else { $names[0] }
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $runtime.Output = Join-Path $StateRoot "operation-$stamp.log"
        $runtime.ErrorLog = Join-Path $StateRoot "operation-$stamp.error.log"
        try {
            foreach ($control in $buttons) { $control.IsEnabled = $false }
            foreach ($control in $checks.Values) { $control.IsEnabled = $false }
            $log.Text = "$($this.Tag) requested for $($names -join ' + ')..."
            $runtime.Operation = Start-Process -FilePath $engine -ArgumentList ($commonArgs + ' -Action ' + $this.Tag + ' -Broker ' + $target) -WindowStyle Hidden -PassThru -RedirectStandardOutput $runtime.Output -RedirectStandardError $runtime.ErrorLog
        } catch {
            $log.Text = $_.Exception.Message
            foreach ($control in $buttons) { $control.IsEnabled = $true }
            foreach ($control in $checks.Values) { $control.IsEnabled = $true }
        }
    })
}
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(900)
$timer.Add_Tick({
    if ($runtime.Operation) {
        if (Test-Path -LiteralPath $runtime.Output) { $log.Text = (@(Get-Content -LiteralPath $runtime.Output -Encoding UTF8 -Tail 30) -join "`r`n") }
        if ($runtime.Operation.HasExited) {
            if (Test-Path -LiteralPath $runtime.ErrorLog) {
                $errorText = Get-Content -LiteralPath $runtime.ErrorLog -Encoding UTF8 -Raw
                if ($errorText) { $log.AppendText("`r`n$errorText") }
            }
            $runtime.Operation.Dispose(); $runtime.Operation = $null; $runtime.NextStatus = [datetime]::MinValue
            foreach ($control in $buttons) { $control.IsEnabled = $true }
            foreach ($control in $checks.Values) { $control.IsEnabled = $true }
        }
    }
    if ($runtime.Status -and $runtime.Status.HasExited) { $runtime.Status.Dispose(); $runtime.Status = $null }
    if (-not $runtime.Operation -and -not $runtime.Status -and (Get-Date) -ge $runtime.NextStatus) {
        $runtime.Status = Start-Process -FilePath $engine -ArgumentList ($commonArgs + ' -Action Status') -WindowStyle Hidden -PassThru
        $runtime.NextStatus = (Get-Date).AddSeconds(8)
    }
    if (Test-Path -LiteralPath $statusPath) {
        try {
            foreach ($item in (Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json)) {
                $labels[$item.Name].Text = $item.State
                $labels[$item.Name].Foreground = $(if ($item.State -eq 'Ready') { '#168269' } elseif ($item.State -eq 'Stopped') { '#77869A' } else { '#AD6C19' })
            }
        } catch { }
    }
})
$window.Add_ContentRendered({ $timer.Start() })
$window.Add_Closed({ $timer.Stop() })
$window.ShowDialog() | Out-Null
