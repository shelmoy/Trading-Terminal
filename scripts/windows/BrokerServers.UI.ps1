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
    public static void Apply(IntPtr hwnd, bool dark, int caption) {
        int corner = 2, backdrop = 1, darkMode = dark ? 1 : 0;
        DwmSetWindowAttribute(hwnd, 33, ref corner, 4);
        DwmSetWindowAttribute(hwnd, 38, ref backdrop, 4);
        DwmSetWindowAttribute(hwnd, 20, ref darkMode, 4);
        DwmSetWindowAttribute(hwnd, 35, ref caption, 4);
    }
}
'@
}
[xml]$markup = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Trading Servers" Width="720" Height="640" MinWidth="540" MinHeight="560" WindowStartupLocation="CenterScreen"
        WindowStyle="SingleBorderWindow" ResizeMode="CanResize" Background="{DynamicResource WindowBrush}" Foreground="{DynamicResource PrimaryBrush}" Opacity="1" FontFamily="Segoe UI" FontSize="14">
  <Window.Resources>
    <SolidColorBrush x:Key="WindowBrush" Color="#EEF3FA"/>
    <SolidColorBrush x:Key="PrimaryBrush" Color="#182B45"/>
    <SolidColorBrush x:Key="SecondaryBrush" Color="#60738B"/>
    <SolidColorBrush x:Key="MutedBrush" Color="#64768F"/>
    <SolidColorBrush x:Key="CardBrush" Color="#EFFFFFFF"/>
    <SolidColorBrush x:Key="EdgeBrush" Color="#FFFFFFFF"/>
    <SolidColorBrush x:Key="ButtonBrush" Color="#EFFFFFFF"/>
    <SolidColorBrush x:Key="DangerBrush" Color="#BA445A"/>
    <SolidColorBrush x:Key="ActivityBrush" Color="#CCFFFFFF"/>
    <SolidColorBrush x:Key="AccentBrush" Color="#2374E8"/>
    <SolidColorBrush x:Key="AccentTextBrush" Color="White"/>
    <SolidColorBrush x:Key="ReadyBrush" Color="#168269"/>
    <SolidColorBrush x:Key="WarningBrush" Color="#AD6C19"/>
    <LinearGradientBrush x:Key="BackdropBrush" StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#F4FAFF"/><GradientStop Color="#E0F4F5" Offset="1"/></LinearGradientBrush>
    <LinearGradientBrush x:Key="StartBrush" StartPoint="0,0" EndPoint="1,1"><GradientStop Color="#3C9AF6"/><GradientStop Color="#2263DC" Offset="1"/></LinearGradientBrush>
    <Style TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="Foreground" Value="{DynamicResource PrimaryBrush}"/>
      <Setter Property="Background" Value="{DynamicResource ButtonBrush}"/><Setter Property="BorderBrush" Value="{DynamicResource EdgeBrush}"/>
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
          <Border x:Name="Toggle" Width="21" Height="21" CornerRadius="7" BorderBrush="{DynamicResource MutedBrush}" BorderThickness="1" Background="{DynamicResource CardBrush}"/>
          <Path x:Name="Tick" Data="M 1,5 L 5,9 L 12,1" Stroke="{DynamicResource AccentTextBrush}" StrokeThickness="2" Width="12" Height="10" Visibility="Collapsed"/>
          <ContentPresenter Grid.Column="1" VerticalAlignment="Center" Margin="10,0,0,0"/>
        </Grid>
        <ControlTemplate.Triggers>
          <Trigger Property="IsChecked" Value="True"><Setter TargetName="Toggle" Property="Background" Value="{DynamicResource AccentBrush}"/><Setter TargetName="Toggle" Property="BorderBrush" Value="{DynamicResource AccentBrush}"/><Setter TargetName="Tick" Property="Visibility" Value="Visible"/></Trigger>
          <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.5"/></Trigger>
        </ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Border CornerRadius="0" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" Background="{DynamicResource BackdropBrush}">
    <Grid Margin="28,18,28,24">
      <Grid.RowDefinitions><RowDefinition Height="26"/><RowDefinition Height="86"/><RowDefinition Height="180"/><RowDefinition Height="76"/><RowDefinition Height="*"/><RowDefinition Height="28"/></Grid.RowDefinitions>
      <TextBlock Text="TRADING WORKSPACE" FontSize="10" FontWeight="SemiBold" Foreground="{DynamicResource MutedBrush}" HorizontalAlignment="Right"/>
      <Grid Grid.Row="1"><Grid.ColumnDefinitions><ColumnDefinition Width="68"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
        <Image x:Name="AppIcon" Width="52" Height="52" VerticalAlignment="Top"/>
        <StackPanel Grid.Column="1"><TextBlock Text="Trading Servers" FontSize="29" FontWeight="SemiBold" Foreground="{DynamicResource PrimaryBrush}"/>
          <TextBlock Text="Two brokers. One calm workspace." Margin="1,6,0,0" Foreground="{DynamicResource SecondaryBrush}" FontSize="14"/></StackPanel>
      </Grid>
      <StackPanel Grid.Row="2">
        <Border CornerRadius="17" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" Padding="18,15" Margin="0,0,0,12">
          <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="160"/></Grid.ColumnDefinitions>
            <CheckBox x:Name="KotakCheck" IsChecked="True"><StackPanel><TextBlock Text="Kotak Neo" Foreground="{DynamicResource PrimaryBrush}" FontWeight="SemiBold" FontSize="16"/><TextBlock Text="127.0.0.1:5000" Foreground="{DynamicResource MutedBrush}" FontSize="12" Margin="0,3,0,0"/></StackPanel></CheckBox>
            <TextBlock x:Name="KotakStatus" Grid.Column="1" Text="Checking…" HorizontalAlignment="Right" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="{DynamicResource SecondaryBrush}"/>
          </Grid>
        </Border>
        <Border CornerRadius="17" Background="{DynamicResource CardBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" Padding="18,15">
          <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="160"/></Grid.ColumnDefinitions>
            <CheckBox x:Name="FyersCheck" IsChecked="True"><StackPanel><TextBlock Text="FYERS" Foreground="{DynamicResource PrimaryBrush}" FontWeight="SemiBold" FontSize="16"/><TextBlock Text="127.0.0.1:5001" Foreground="{DynamicResource MutedBrush}" FontSize="12" Margin="0,3,0,0"/></StackPanel></CheckBox>
            <TextBlock x:Name="FyersStatus" Grid.Column="1" Text="Checking…" HorizontalAlignment="Right" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="{DynamicResource SecondaryBrush}"/>
          </Grid>
        </Border>
      </StackPanel>
      <UniformGrid Grid.Row="3" Columns="3" VerticalAlignment="Center">
        <Button x:Name="StartButton" Tag="Start" Margin="0,0,8,0" Foreground="{DynamicResource AccentTextBrush}" BorderBrush="{DynamicResource AccentBrush}" Background="{DynamicResource StartBrush}"><TextBlock Text="▶   Start" FontWeight="SemiBold"/></Button>
        <Button x:Name="StopButton" Tag="Stop" Margin="4,0,4,0" Foreground="{DynamicResource DangerBrush}"><TextBlock Text="■   Stop" FontWeight="SemiBold"/></Button>
        <Button x:Name="RestartButton" Tag="Restart" Margin="8,0,0,0"><TextBlock Text="↻   Restart" FontWeight="SemiBold"/></Button>
      </UniformGrid>
      <Border Grid.Row="4" CornerRadius="15" Background="{DynamicResource ActivityBrush}" BorderBrush="{DynamicResource EdgeBrush}" BorderThickness="1" Padding="16,12" Margin="0,3,0,12">
        <Grid><Grid.RowDefinitions><RowDefinition Height="25"/><RowDefinition Height="*"/></Grid.RowDefinitions>
          <TextBlock Text="ACTIVITY" FontWeight="SemiBold" FontSize="10" Foreground="{DynamicResource MutedBrush}"/>
          <TextBox x:Name="Activity" Grid.Row="1" Text="Select your brokers, then Start. Both pages open as tabs in Chrome." IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Background="Transparent" BorderThickness="0" Foreground="{DynamicResource SecondaryBrush}" FontSize="12"/>
        </Grid>
      </Border>
      <TextBlock Grid.Row="5" Text="Closing this window keeps your broker servers running." Foreground="{DynamicResource MutedBrush}" FontSize="12" HorizontalAlignment="Center" VerticalAlignment="Bottom"/>
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
$themeState = @{ Mode = $null }
function Get-ControllerSystemTheme {
    if ([Windows.SystemParameters]::HighContrast) { return 'HighContrast' }
    try {
        $light = Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name AppsUseLightTheme -ErrorAction Stop
        if ([int]$light -eq 0) { return 'Dark' }
    } catch { }
    return 'Light'
}
function Set-ControllerTheme([string]$Mode, [switch]$Force) {
    if ($themeState.Mode -eq $Mode -and -not $Force) { return }
    $themeState.Mode = $Mode
    if ($Mode -eq 'Dark') {
        $palette = @{
            WindowBrush = '#161E2B'; PrimaryBrush = '#EDF3FC'; SecondaryBrush = '#B5C5D9'; MutedBrush = '#A3B3C9'
            CardBrush = '#E626354B'; EdgeBrush = '#465B73'; ButtonBrush = '#293A51'; DangerBrush = '#FF9AAE'
            ActivityBrush = '#D9202D40'; AccentBrush = '#4C9BFA'; AccentTextBrush = '#FFFFFF'
            ReadyBrush = '#64DBB1'; WarningBrush = '#FFC781'
            GradientStart = '#223148'; GradientEnd = '#182C36'; StartTop = '#3F8EF5'; StartBottom = '#275ECF'
        }
    } elseif ($Mode -eq 'HighContrast') {
        $palette = @{
            WindowBrush = [Windows.SystemColors]::WindowColor; PrimaryBrush = [Windows.SystemColors]::WindowTextColor
            SecondaryBrush = [Windows.SystemColors]::WindowTextColor; MutedBrush = [Windows.SystemColors]::WindowTextColor
            CardBrush = [Windows.SystemColors]::WindowColor; EdgeBrush = [Windows.SystemColors]::WindowTextColor
            ButtonBrush = [Windows.SystemColors]::ControlColor; DangerBrush = [Windows.SystemColors]::ControlTextColor
            ActivityBrush = [Windows.SystemColors]::WindowColor; AccentBrush = [Windows.SystemColors]::HighlightColor
            AccentTextBrush = [Windows.SystemColors]::HighlightTextColor; ReadyBrush = [Windows.SystemColors]::WindowTextColor
            WarningBrush = [Windows.SystemColors]::WindowTextColor; GradientStart = [Windows.SystemColors]::WindowColor
            GradientEnd = [Windows.SystemColors]::WindowColor; StartTop = [Windows.SystemColors]::HighlightColor
            StartBottom = [Windows.SystemColors]::HighlightColor
        }
    } else {
        $palette = @{
            WindowBrush = '#EEF3FA'; PrimaryBrush = '#182B45'; SecondaryBrush = '#526780'; MutedBrush = '#5C708B'
            CardBrush = '#EFFFFFFF'; EdgeBrush = '#FFFFFFFF'; ButtonBrush = '#EFFFFFFF'; DangerBrush = '#BA445A'
            ActivityBrush = '#CCFFFFFF'; AccentBrush = '#2374E8'; AccentTextBrush = '#FFFFFF'
            ReadyBrush = '#13785F'; WarningBrush = '#946011'
            GradientStart = '#F3F7FD'; GradientEnd = '#E0EDF5'; StartTop = '#3C9AF6'; StartBottom = '#2263DC'
        }
    }
    foreach ($key in @($palette.Keys | Where-Object { $_ -like '*Brush' })) {
        $color = [Windows.Media.ColorConverter]::ConvertFromString([string]$palette[$key])
        $brush = New-Object Windows.Media.SolidColorBrush($color)
        $brush.Freeze()
        $window.Resources[$key] = $brush.PSObject.BaseObject
    }
    foreach ($gradient in @(@('BackdropBrush', 'GradientStart', 'GradientEnd'), @('StartBrush', 'StartTop', 'StartBottom'))) {
        $brush = New-Object Windows.Media.LinearGradientBrush
        $brush.StartPoint = New-Object Windows.Point(0, 0); $brush.EndPoint = New-Object Windows.Point(1, 1)
        $brush.GradientStops.Add((New-Object Windows.Media.GradientStop([Windows.Media.ColorConverter]::ConvertFromString([string]$palette[$gradient[1]]), 0)))
        $brush.GradientStops.Add((New-Object Windows.Media.GradientStop([Windows.Media.ColorConverter]::ConvertFromString([string]$palette[$gradient[2]]), 1)))
        $brush.Freeze()
        $window.Resources[$gradient[0]] = $brush.PSObject.BaseObject
    }
    $handle = (New-Object Windows.Interop.WindowInteropHelper $window).Handle
    if ($handle -ne [IntPtr]::Zero) {
        $baseColor = $window.Resources['WindowBrush'].Color
        $captionColor = [int]$baseColor.R -bor ([int]$baseColor.G -shl 8) -bor ([int]$baseColor.B -shl 16)
        $darkCaption = $Mode -eq 'Dark' -or ($Mode -eq 'HighContrast' -and $baseColor.R -lt 128)
        [TradingGlassWindow]::Apply($handle, $darkCaption, $captionColor)
    }
}
Set-ControllerTheme -Mode (Get-ControllerSystemTheme)
$window.Add_SourceInitialized({
    $handle = (New-Object Windows.Interop.WindowInteropHelper $window).Handle
    Set-ControllerTheme -Mode (Get-ControllerSystemTheme) -Force
})
$runtime = @{ NextTheme = [datetime]::MinValue; Operation = $null; Status = $null; NextStatus = [datetime]::MinValue; Output = $null; ErrorLog = $null }
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
    if ((Get-Date) -ge $runtime.NextTheme) {
        Set-ControllerTheme -Mode (Get-ControllerSystemTheme)
        $runtime.NextTheme = (Get-Date).AddSeconds(2)
    }
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
                $labels[$item.Name].SetResourceReference([Windows.Controls.TextBlock]::ForegroundProperty, $(if ($item.State -eq 'Ready') { 'ReadyBrush' } elseif ($item.State -eq 'Stopped') { 'MutedBrush' } else { 'WarningBrush' }))
            }
        } catch { }
    }
})
$window.Add_ContentRendered({ $timer.Start() })
$window.Add_Closed({ $timer.Stop() })
$window.ShowDialog() | Out-Null
